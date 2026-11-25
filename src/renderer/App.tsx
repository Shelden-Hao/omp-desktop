import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
	FormEvent as ReactFormEvent,
	KeyboardEvent as ReactKeyboardEvent,
	MouseEvent as ReactMouseEvent,
} from "react";
import {
	AcpClient,
	type AcpEvent,
	type ApprovalMode,
	type ChatMessage,
	type ContentBlock,
	type ContextPart,
	type ContextReport,
	type DesktopSettings,
	type McpConfigInfo,
	type ThemeMode,
	type SessionState,
	type SkillSummary,
	normalizeSessionState,
} from "./acp-client";
import { DEFAULT_DOCS, type DocFile } from "./docs";
import { SkillsPanel } from "./SkillsPanel";

interface Session {
	id: string;
	title: string;
	cwd?: string;
	ts?: number;
}

type SidebarView = "recent" | "grouped";

/** 任务状态筛选。状态由本地会话数据推导，omp 本身不返回任务状态。 */
type StatusFilter = "all" | "running" | "done" | "failed" | "pending" | "planned";
type TimeFilter = "all" | "today" | "week" | "month";

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
	{ value: "all", label: "全部状态" },
	{ value: "running", label: "进行中" },
	{ value: "done", label: "已完成" },
	{ value: "failed", label: "失败" },
	{ value: "pending", label: "待处理" },
	{ value: "planned", label: "规划中" },
];

const TIME_FILTERS: Array<{ value: TimeFilter; label: string }> = [
	{ value: "all", label: "全部时间" },
	{ value: "today", label: "今天" },
	{ value: "week", label: "最近 7 天" },
	{ value: "month", label: "最近 30 天" },
];

interface PermissionState {
	sessionId: string;
	title: string;
	options: Array<{ optionId: string; name: string; kind: string }>;
	respond: (result: unknown) => void;
}

type IconName =
	| "plus"
	| "settings"
	| "sun"
	| "moon"
	| "monitor"
	| "folder"
	| "file"
	| "link"
	| "close"
	| "send"
	| "stop"
	| "chevron"
	| "panel"
	| "refresh"
	| "copy"
	| "check"
	| "spark"
	| "warning"
	| "search"
	| "chat"
	| "grid"
	| "clock"
	| "layers"
	| "chevron-right"
	| "more"
	| "rotate"
	| "minimize"
	| "maximize"
	| "sidebar"
	| "filter"
	| "shield";

const uid = () => Math.random().toString(36).slice(2, 10);

const THEME_LABEL: Record<ThemeMode, string> = {
	light: "浅色",
	dark: "深色",
	system: "跟随系统",
};

function shortPath(path: string) {
	const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
	return parts.slice(-2).join("/") || "工作目录";
}

function dirName(path: string) {
	const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
	return parts[parts.length - 1] || "工作目录";
}

function relativeTime(ts?: number) {
	if (!ts) return "";
	const diff = Date.now() - ts;
	const minute = 60_000;
	const hour = 60 * minute;
	const day = 24 * hour;
	if (diff < minute) return "刚刚";
	if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
	if (diff < day) return `${Math.floor(diff / hour)}小时前`;
	if (diff < 7 * day) return `${Math.floor(diff / day)}天前`;
	return new Date(ts).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function formatDuration(ms?: number) {
	if (ms === undefined) return "";
	const seconds = Math.max(0, Math.floor(ms / 1000));
	if (seconds < 60) return `${seconds}秒`;
	const minutes = Math.floor(seconds / 60);
	return `${minutes}分${seconds % 60}秒`;
}

/** 思考强度 / 运行模式的展示文案，取值来自 ACP，未知值原样显示 */
const THINKING_LABEL: Record<string, string> = {
	off: "关闭",
	none: "关闭",
	auto: "自动",
	minimal: "极低",
	low: "低",
	medium: "中",
	high: "高",
	xhigh: "很高",
	max: "最大",
};

const MODE_LABEL: Record<string, string> = {
	default: "默认",
	plan: "规划",
	accept_edits: "自动编辑",
	read_only: "只读",
};

function pickLabel(map: Record<string, string>, value?: string, fallback?: string) {
	if (value && map[value]) return map[value];
	return fallback || value || "";
}

/** 上下文窗口按 1.0M / 288K 展示 */
function formatContext(tokens: number) {
	if (tokens >= 1_000_000) {
		const millions = tokens / 1_000_000;
		return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
	}
	return `${Math.round(tokens / 1000)}K`;
}

/** 精确到 0.1K 的 token 展示，用于「已使用 191.4K」这类文案 */
function formatTokens(tokens: number) {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
	return String(Math.round(tokens));
}

const APPROVAL_LABEL: Record<ApprovalMode, string> = {
	yolo: "完全允许",
	write: "仅写入确认",
	"always-ask-cached": "询问并记住",
	"always-ask": "每次询问",
};

const APPROVAL_HINT: Record<ApprovalMode, string> = {
	yolo: "所有工具调用直接执行，不再确认",
	write: "读取自动通过，写文件与执行命令前确认",
	"always-ask-cached": "文件读取也需要确认，确认后可记住该路径",
	"always-ask": "仅只读工具自动通过，其它每次都要确认",
};

const APPROVAL_OPTIONS: ApprovalMode[] = ["yolo", "write", "always-ask-cached", "always-ask"];

/** 光标前正在输入的技能指令：/name 或 /skill:name（omp 实际识别的写法） */
const SKILL_TOKEN_RE = /(?:^|\s)\/(?:skill:)?([\w-]*)$/;
/** 光标前正在输入的资源引用：@关键字；Win 路径含空格，关键字阶段只匹配非空白 */
const RESOURCE_TOKEN_RE = /(?:^|\s)@([^\s@]*)$/;
/** contenteditable 中 inline chip 的标记属性；DOM 即内容真相源 */
const SKILL_CHIP_ATTR = "data-skill";
const RESOURCE_CHIP_ATTR = "data-resource";
/** 两种 chip 共用的删除判定 */
const CHIP_ATTRS = [SKILL_CHIP_ATTR, RESOURCE_CHIP_ATTR] as const;

interface ResourceCandidate {
	/** 发送到 omp 的真实文本：文件为 @path（含空格加引号），网址为裸 URL */
	value: string;
	/** chip 上显示的名字：文件名或域名 */
	label: string;
	/** 联想面板的来源分类 */
	group: "对话中的文件" | "对话中的资源" | "网址";
	detail: string;
}

/** 从工具调用参数/标题里抽取真实出现过的文件路径（不是臆造的候选） */
function extractPathsFromMessages(messages: ChatMessage[]): string[] {
	const paths = new Set<string>();
	const push = (value: unknown) => {
		if (typeof value !== "string") return;
		// 常见字段：path/filePath/file_path；兼容整段参数里出现的绝对路径
		const matches = value.match(/(?:[A-Za-z]:[\\/][^\s"',;}\]]+|(?:\.{0,2}\/|~\/)[\w./-]+)/g);
		for (const item of matches ?? []) {
			const clean = item.replace(/[)\]}>]+$/, "");
			if (clean.length > 3) paths.add(clean);
		}
	};
	for (const message of messages) {
		for (const block of message.blocks) {
			if (block.type !== "tool_call" && block.type !== "tool_result") continue;
			push(block.title);
			push(block.rawInput);
			push(block.result);
		}
	}
	return [...paths];
}

/** 从对话文本里抽取真实出现过的网址 */
function extractUrlsFromMessages(messages: ChatMessage[]): string[] {
	const urls = new Set<string>();
	for (const message of messages) {
		for (const block of message.blocks) {
			if (block.type !== "text" && block.type !== "tool_result") continue;
			for (const match of block.text.match(/https?:\/\/[^\s<>"')\]}]+/g) ?? []) {
				urls.add(match.replace(/[.,;:]+$/, ""));
			}
		}
	}
	return [...urls];
}

const urlLabel = (url: string) => {
	try {
		return new URL(url).hostname;
	} catch {
		return url.length > 28 ? `${url.slice(0, 28)}…` : url;
	}
};

/** 把联想草稿（@xxx 或 /xxx）从光标前的文本节点里删掉，避免 chip 与文本重复 */
function dropDraftBeforeCursor(range: Range, tokenRe: RegExp) {
	let node = range.startContainer;
	let offset = range.startOffset;
	// 光标可能停在 contenteditable 容器本身（如点击联想项后），此时取前一个文本节点的末尾
	if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
		const previous = node.childNodes[offset - 1];
		if (previous?.nodeType === Node.TEXT_NODE) {
			node = previous;
			offset = previous.textContent?.length ?? 0;
		}
	}
	if (node.nodeType !== Node.TEXT_NODE || offset === 0) return;
	const match = (node.textContent ?? "").slice(0, offset).match(tokenRe);
	if (!match) return;
	const start = offset - match[0].length;
	const drop = document.createRange();
	drop.setStart(node, start);
	drop.setEnd(node, offset);
	drop.deleteContents();
	range.setStart(node, start);
	range.collapse(true);
}

/** omp `/context` 输出里的分段名称 → 中文 */
const CONTEXT_PART_LABEL: Record<string, string> = {
	"system prompt": "系统提示词",
	"system tools": "工具",
	"system context": "系统上下文",
	"instruction files": "指令文件",
	skills: "技能",
	messages: "对话消息",
	"tool output": "工具输出",
	"auto-compact buf": "自动压缩预留",
	free: "空闲",
};

/** 分段条配色，按出现顺序取用；与图例圆点共用 */
const CONTEXT_PART_COLORS = ["#6d5efc", "#12b981", "#f59e0b", "#8b5cf6", "#ec4899", "#0ea5e9"];

/**
 * 解析 omp `/context` 的纯文本输出，例如：
 *   Context window: 1032192 tokens (16% used)
 *     System prompt    [░░░] 0%  1731 tokens
 * 官方没有提供结构化字段，这里只做格式解析，数值全部来自 omp 自身统计。
 */
function parseContextReport(text: string): ContextReport | null {
	if (!text.includes("Context window")) return null;
	const windowMatch = text.match(/Context window:\s*([\d,]+)\s*tokens/i);
	if (!windowMatch) return null;
	const contextWindow = Number(windowMatch[1].replace(/,/g, ""));
	if (!contextWindow) return null;

	const parts: ContextPart[] = [];
	let reservedTokens = 0;
	for (const line of text.split("\n")) {
		const match = line.match(/^\s+(.+?)\s+\[[^\]]*\]\s*\d+%\s+([\d,]+)\s+tokens\s*$/);
		if (!match) continue;
		const rawName = match[1].trim();
		const key = rawName.toLowerCase();
		const tokens = Number(match[2].replace(/,/g, ""));
		if (key === "free") continue;
		if (key === "auto-compact buf") {
			reservedTokens = tokens;
			continue;
		}
		parts.push({
			key,
			label: CONTEXT_PART_LABEL[key] || rawName,
			tokens,
			percent: (tokens / contextWindow) * 100,
		});
	}
	if (!parts.length) return null;

	const usedTokens = parts.reduce((sum, part) => sum + part.tokens, 0);
	return {
		contextWindow,
		usedTokens,
		percent: (usedTokens / contextWindow) * 100,
		parts,
		reservedTokens,
	};
}

interface ModelRowOption {
	value: string;
	label: string;
}

interface ModelRow {
	id: string;
	label: string;
	valueLabel: string;
	currentValue?: string;
	options?: ModelRowOption[];
	onSelect?: (value: string) => void;
}

function extractText(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join("");
	if (value && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		if (typeof obj.text === "string") return obj.text;
		if (obj.content !== undefined) return extractText(obj.content);
	}
	return "";
}

function formatToolInput(raw: unknown): string {
	if (raw === undefined || raw === null) return "";
	if (typeof raw === "string") return raw;
	try {
		return JSON.stringify(raw, null, 2);
	} catch {
		return String(raw);
	}
}

function Icon({
	name,
	size = 16,
	className,
}: {
	name: IconName;
	size?: number;
	className?: string;
}) {
	const common = {
		className,
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.8,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		"aria-hidden": true,
	};
	switch (name) {
		case "plus":
			return (
				<svg {...common}>
					<path d="M12 5v14M5 12h14" />
				</svg>
			);
		case "settings":
			return (
				<svg {...common}>
					<circle cx="12" cy="12" r="3" />
					<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2H8.9v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2.8-2.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H1.8v-3.9h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.8-2.8.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V2h3.9v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.2v3.9h-.2a1.7 1.7 0 0 0-1.5 1Z" />
				</svg>
			);
		case "sun":
			return (
				<svg {...common}>
					<circle cx="12" cy="12" r="4" />
					<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
				</svg>
			);
		case "moon":
			return (
				<svg {...common}>
					<path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.7 6.7 0 0 0 10.7 10.7Z" />
				</svg>
			);
		case "monitor":
			return (
				<svg {...common}>
					<rect x="3" y="4" width="18" height="13" rx="2" />
					<path d="M8 21h8M12 17v4" />
				</svg>
			);
		case "folder":
			return (
				<svg {...common}>
					<path d="M3 7.5h6.2l2 2H21v9.5H3z" />
				</svg>
			);
		case "file":
			return (
				<svg {...common}>
					<path d="M6 3h8l4 4v14H6zM14 3v5h4" />
				</svg>
			);
		case "link":
			return (
				<svg {...common}>
					<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
					<path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
				</svg>
			);
		case "close":
			return (
				<svg {...common}>
					<path d="M6 6l12 12M18 6 6 18" />
				</svg>
			);
		case "minimize":
			return (
				<svg {...common}>
					<path d="M5 12h14" />
				</svg>
			);
		case "maximize":
			return (
				<svg {...common}>
					<rect x="5" y="5" width="14" height="14" rx="1" />
				</svg>
			);
		case "send":
			return (
				<svg {...common}>
					<path d="M4 12 20 4l-6.5 16-2.7-6.8L4 12Z" />
				</svg>
			);
		case "stop":
			return (
				<svg {...common}>
					<rect x="6" y="6" width="12" height="12" rx="2" />
				</svg>
			);
		case "chevron":
			return (
				<svg {...common}>
					<path d="m6 9 6 6 6-6" />
				</svg>
			);
		case "panel":
			return (
				<svg {...common}>
					<rect x="3" y="4" width="18" height="16" rx="2" />
					<path d="M15 4v16" />
				</svg>
			);
		case "sidebar":
			return (
				<svg {...common}>
					<rect x="3" y="4" width="18" height="16" rx="4.5" />
					<path d="M9.5 5.2v13.6" />
					<path d="M4.6 5.2h4.4v13.6H4.6z" fill="currentColor" stroke="none" opacity="0.5" />
				</svg>
			);
		case "filter":
			return (
				<svg {...common}>
					<path d="M4 5h16l-6 7.6V19l-4-2.4v-4L4 5Z" />
				</svg>
			);
		case "shield":
			return (
				<svg {...common}>
					<path d="M12 3.2 5 6v5.4c0 4.3 2.9 7.4 7 9.4 4.1-2 7-5.1 7-9.4V6l-7-2.8Z" />
				</svg>
			);
		case "refresh":
			return (
				<svg {...common}>
					<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />
				</svg>
			);
		case "copy":
			return (
				<svg {...common}>
					<rect x="8" y="8" width="12" height="12" rx="2" />
					<path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
				</svg>
			);
		case "check":
			return (
				<svg {...common}>
					<path d="m5 12 4.5 4.5L19 7" />
				</svg>
			);
		case "spark":
			return (
				<svg {...common}>
					<path d="m12 3 2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1L12 3Z" />
				</svg>
			);
		case "warning":
			return (
				<svg {...common}>
					<path d="M12 3 2.5 20h19L12 3ZM12 9v5M12 17.5v.5" />
				</svg>
			);
		case "search":
			return (
				<svg {...common}>
					<circle cx="11" cy="11" r="7" />
					<path d="m20 20-4-4" />
				</svg>
			);
		case "chat":
			return (
				<svg {...common}>
					<path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z" />
				</svg>
			);
		case "grid":
			return (
				<svg {...common}>
					<rect x="3" y="3" width="7" height="7" rx="1.5" />
					<rect x="14" y="3" width="7" height="7" rx="1.5" />
					<rect x="3" y="14" width="7" height="7" rx="1.5" />
					<rect x="14" y="14" width="7" height="7" rx="1.5" />
				</svg>
			);
		case "clock":
			return (
				<svg {...common}>
					<circle cx="12" cy="12" r="9" />
					<path d="M12 7v5l3 2" />
				</svg>
			);
		case "layers":
			return (
				<svg {...common}>
					<path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5" />
				</svg>
			);
		case "chevron-right":
			return (
				<svg {...common}>
					<path d="m9 6 6 6-6 6" />
				</svg>
			);
		case "more":
			return (
				<svg {...common}>
					<circle cx="5" cy="12" r="1" />
					<circle cx="12" cy="12" r="1" />
					<circle cx="19" cy="12" r="1" />
				</svg>
			);
		case "rotate":
			return (
				<svg {...common}>
					<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5" />
				</svg>
			);
	}
}

type MdBlock =
	| { type: "heading"; level: number; text: string }
	| { type: "paragraph"; text: string }
	| { type: "list"; items: string[] }
	| { type: "code"; lang: string; text: string };

function parseMarkdown(source: string): MdBlock[] {
	const lines = source.replace(/\r\n/g, "\n").split("\n");
	const blocks: MdBlock[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (/^\s*```/.test(line)) {
			const lang = line.replace(/^\s*```/, "").trim();
			i += 1;
			const code: string[] = [];
			while (i < lines.length && !/^\s*```/.test(lines[i])) {
				code.push(lines[i]);
				i += 1;
			}
			if (i < lines.length) i += 1;
			blocks.push({ type: "code", lang, text: code.join("\n") });
			continue;
		}

		const heading = /^(#{1,6})\s+(.+)$/.exec(line);
		if (heading) {
			blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
			i += 1;
			continue;
		}

		if (/^\s*[-*]\s+/.test(line)) {
			const items: string[] = [];
			while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
				items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
				i += 1;
			}
			blocks.push({ type: "list", items });
			continue;
		}

		if (!line.trim()) {
			i += 1;
			continue;
		}

		const paragraph: string[] = [];
		while (
			i < lines.length &&
			lines[i].trim() &&
			!/^\s*```/.test(lines[i]) &&
			!/^#{1,6}\s+/.test(lines[i]) &&
			!/^\s*[-*]\s+/.test(lines[i])
		) {
			paragraph.push(lines[i]);
			i += 1;
		}
		blocks.push({ type: "paragraph", text: paragraph.join(" ") });
	}

	return blocks;
}

function InlineText({ text, query = "" }: { text: string; query?: string }) {
	const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
	return (
		<>
			{parts.map((part, index) => {
				if (part.startsWith("`") && part.endsWith("`")) {
					return (
						<code key={index}>
							<Highlight text={part.slice(1, -1)} query={query} />
						</code>
					);
				}
				if (part.startsWith("**") && part.endsWith("**")) {
					return (
						<strong key={index}>
							<Highlight text={part.slice(2, -2)} query={query} />
						</strong>
					);
				}
				return (
					<span key={index}>
						<Highlight text={part} query={query} />
					</span>
				);
			})}
		</>
	);
}

function CodeBlock({
	code,
	lang,
	onOpen,
}: {
	code: string;
	lang?: string;
	onOpen?: (name: string, content: string) => void;
}) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1400);
		} catch {
			setCopied(false);
		}
	};

	return (
		<div className="omp-codeblock">
			<div className="omp-codeblock-head">
				<span>{lang || "text"}</span>
				<div>
					<button type="button" onClick={copy} title="复制代码">
						<Icon name={copied ? "check" : "copy"} size={13} />
						{copied ? "已复制" : "复制"}
					</button>
					{onOpen && (
						<button type="button" onClick={() => onOpen("snippet.md", code)} title="在预览中打开">
							<Icon name="file" size={13} />
							预览
						</button>
					)}
				</div>
			</div>
			<pre>
				<code>{code}</code>
			</pre>
		</div>
	);
}

function Markdown({
	text,
	onOpen,
	query = "",
}: {
	text: string;
	onOpen: (name: string, content: string) => void;
	query?: string;
}) {
	const blocks = useMemo(() => parseMarkdown(text), [text]);
	return (
		<div className="omp-markdown">
			{blocks.map((block, index) => {
				if (block.type === "heading") {
					const Tag = `h${Math.min(block.level + 1, 6)}` as "h2" | "h3" | "h4" | "h5" | "h6";
					return (
						<Tag key={index}>
							<InlineText text={block.text} query={query} />
						</Tag>
					);
				}
				if (block.type === "list") {
					return (
						<ul key={index}>
							{block.items.map((item, itemIndex) => (
								<li key={itemIndex}>
									<InlineText text={item} query={query} />
								</li>
							))}
						</ul>
					);
				}
				if (block.type === "code") {
					return <CodeBlock key={index} code={block.text} lang={block.lang} onOpen={onOpen} />;
				}
				return (
					<p key={index}>
						<InlineText text={block.text} query={query} />
					</p>
				);
			})}
		</div>
	);
}

function Highlight({ text, query }: { text: string; query: string }) {
	if (!query.trim()) return <>{text}</>;
	const lower = text.toLowerCase();
	const target = query.toLowerCase();
	const parts: Array<{ text: string; hit: boolean }> = [];
	let cursor = 0;
	let found = lower.indexOf(target);
	while (found >= 0) {
		if (found > cursor) parts.push({ text: text.slice(cursor, found), hit: false });
		parts.push({ text: text.slice(found, found + query.length), hit: true });
		cursor = found + query.length;
		found = lower.indexOf(target, cursor);
	}
	if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
	return (
		<>
			{parts.map((part, index) =>
				part.hit ? (
					<mark key={index} data-search-hit>
						{part.text}
					</mark>
				) : (
					<span key={index}>{part.text}</span>
				),
			)}
		</>
	);
}

function MessageActions({ text, onRetry }: { text: string; onRetry?: () => void }) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1400);
		} catch {
			setCopied(false);
		}
	};
	return (
		<div className="omp-message-actions">
			<button type="button" onClick={() => void copy()} title="复制消息">
				<Icon name={copied ? "check" : "copy"} size={13} />
				{copied ? "已复制" : "复制"}
			</button>
			{onRetry && (
				<button type="button" onClick={onRetry} title="重新发送">
					<Icon name="rotate" size={13} />
					重试
				</button>
			)}
		</div>
	);
}

const TOOL_STATUS: Record<string, { label: string; icon: IconName }> = {
	pending: { label: "执行中", icon: "spark" },
	completed: { label: "已完成", icon: "check" },
	failed: { label: "失败", icon: "warning" },
};

const TOOL_KIND_LABEL: Record<string, string> = {
	read: "读取文件",
	edit: "编辑文件",
	delete: "删除文件",
	move: "移动文件",
	search: "搜索",
	execute: "运行命令",
	think: "思考",
	fetch: "获取内容",
	switch_mode: "切换模式",
	other: "工具调用",
};

function toolLabel(block: ContentBlock): string {
	if (block.kind && TOOL_KIND_LABEL[block.kind]) return TOOL_KIND_LABEL[block.kind];
	const name = (block.toolName || "").toLowerCase();
	if (/bash|shell|exec|command|terminal/.test(name)) return "运行命令";
	if (/read|cat|file/.test(name)) return "读取文件";
	if (/write|edit|patch|apply/.test(name)) return "编辑文件";
	if (/grep|glob|search|find/.test(name)) return "搜索";
	if (/fetch|web|http/.test(name)) return "获取内容";
	return block.toolName || "工具调用";
}

function Block({
	block,
	onOpenDoc,
	query = "",
}: {
	block: ContentBlock;
	onOpenDoc: (name: string, content: string) => void;
	query?: string;
}) {
	if (block.type === "thinking") {
		return (
			<details className="omp-thinking">
				<summary>
					<Icon name="spark" size={14} />
					<span>深度思考</span>
					<svg
						className="omp-fold-chevron"
						viewBox="0 0 16 16"
						width="13"
						height="13"
						aria-hidden="true"
					>
						<path
							d="M4 6l4 4 4-4"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</summary>
				<div className="omp-thinking-body">
					<Markdown text={block.text} onOpen={onOpenDoc} query={query} />
				</div>
			</details>
		);
	}

	if (block.type === "tool_call") {
		const status = TOOL_STATUS[block.status || "pending"];
		const label = toolLabel(block);
		const raw = block.raw as Record<string, unknown> | undefined;
		const legacyTitle = typeof raw?.title === "string" ? raw.title : "";
		const title = block.title || legacyTitle;
		const legacyResult =
			!block.result && block.text && block.text !== raw?.toolCallId ? block.text : "";
		const result = block.result || legacyResult;
		const input = block.rawInput || "";
		const hasDetail = Boolean(title || input || result);
		return (
			<details className={`omp-tool-card ${block.status || "pending"}`}>
				<summary className="omp-tool-summary">
					<span className="omp-tool-icon">
						<Icon name={status.icon} size={14} />
					</span>
					<span className="omp-tool-label">{label}</span>
					{title && <span className="omp-tool-title-inline">{title}</span>}
					<span className="omp-tool-status">{status.label}</span>
					<svg
						className="omp-fold-chevron"
						viewBox="0 0 16 16"
						width="13"
						height="13"
						aria-hidden="true"
					>
						<path
							d="M4 6l4 4 4-4"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</summary>
				{hasDetail && (
					<div className="omp-tool-body">
						{input && (
							<div className="omp-tool-section">
								<div className="omp-tool-section-label">输入</div>
								<pre className="omp-tool-pre">{input}</pre>
							</div>
						)}
						{result && (
							<div className="omp-tool-section">
								<div className="omp-tool-section-label">结果</div>
								<pre className="omp-tool-pre">{result}</pre>
							</div>
						)}
					</div>
				)}
			</details>
		);
	}

	if (block.type === "tool_result" || block.type === "diff" || block.type === "other") {
		return <CodeBlock code={block.text} />;
	}

	return <Markdown text={block.text} onOpen={onOpenDoc} query={query} />;
}

/** 底部圆环：外层是上下文窗口，内层弧线是已用比例 */
function ContextRing({ percent, size = 17 }: { percent: number; size?: number }) {
	const clamped = Math.max(0, Math.min(100, percent));
	const stroke = 2.4;
	const center = size / 2;
	const radius = center - stroke / 2;
	const circumference = 2 * Math.PI * radius;
	const filled = (clamped / 100) * circumference;
	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			className="omp-context-ring"
			aria-hidden="true"
		>
			<circle
				className="omp-context-track"
				cx={center}
				cy={center}
				r={radius}
				fill="none"
				strokeWidth={stroke}
			/>
			{clamped > 0 && (
				<circle
					className="omp-context-progress"
					cx={center}
					cy={center}
					r={radius}
					fill="none"
					strokeWidth={stroke}
					strokeLinecap="round"
					strokeDasharray={`${filled} ${circumference - filled}`}
					transform={`rotate(-90 ${center} ${center})`}
				/>
			)}
		</svg>
	);
}

/** 上下文分段条 + 图例，数值全部来自 omp `/context` */
function ContextMeter({ report }: { report: ContextReport }) {
	const parts: Array<ContextPart & { color: string }> = report.parts.map((part, index) => ({
		...part,
		color: CONTEXT_PART_COLORS[index % CONTEXT_PART_COLORS.length],
	}));
	const reservedPercent = (report.reservedTokens / report.contextWindow) * 100;
	const freePercent = Math.max(
		0,
		100 - parts.reduce((sum, part) => sum + part.percent, 0) - reservedPercent,
	);
	// 占比过小的分类在分段条上会挤成杂色碎条，只保留图例
	const barParts = parts.filter((part) => part.percent >= 0.3);
	const formatPercent = (value: number) =>
		value > 0 && value < 0.1 ? "<0.1%" : `${value.toFixed(1)}%`;
	return (
		<>
			<div className="omp-context-bar">
				{barParts.map((part) => (
					<span
						key={part.key}
						className="omp-context-seg"
						style={{ width: `${part.percent}%`, background: part.color }}
						title={`${part.label} ${formatTokens(part.tokens)}`}
					/>
				))}
				{reservedPercent > 0 && (
					<span
						className="omp-context-seg reserved"
						style={{ width: `${reservedPercent}%` }}
						title={`自动压缩预留 ${formatTokens(report.reservedTokens)}`}
					/>
				)}
				{freePercent > 0 && (
					<span className="omp-context-seg free" style={{ width: `${freePercent}%` }} />
				)}
			</div>
			<ul className="omp-context-legend">
				{parts.map((part) => (
					<li key={part.key}>
						<span className="omp-context-dot" style={{ background: part.color }} />
						<span className="omp-context-legend-label">{part.label}</span>
						<span className="omp-context-legend-value">{formatPercent(part.percent)}</span>
					</li>
				))}
				{report.reservedTokens > 0 && (
					<li>
						<span className="omp-context-dot reserved" />
						<span className="omp-context-legend-label">自动压缩预留</span>
						<span className="omp-context-legend-value">{formatPercent(reservedPercent)}</span>
					</li>
				)}
			</ul>
		</>
	);
}

export function App() {
	const [client, setClient] = useState<AcpClient | null>(null);
	const [sessions, setSessions] = useState<Session[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({});
	const [input, setInput] = useState("");
	const [running, setRunning] = useState(false);
	const [connected, setConnected] = useState(false);
	const [status, setStatus] = useState("准备连接 omp…");
	const [stderrLog, setStderrLog] = useState<string[]>([]);
	const [showSettings, setShowSettings] = useState(false);
	const [showSkills, setShowSkills] = useState(false);
	const [settings, setSettings] = useState<DesktopSettings>({
		ompCliPath: "",
		bunPath: "",
		cwd: "",
		theme: "system",
		approvalMode: "yolo",
	});
	const [permission, setPermission] = useState<PermissionState | null>(null);
	const [docs, setDocs] = useState<DocFile[]>(DEFAULT_DOCS);
	const [activeDoc, setActiveDoc] = useState<string | null>(null);
	const [showPreview, setShowPreview] = useState(true);
	const [sidebarView, setSidebarView] = useState<SidebarView>("recent");
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
	const [filterOpen, setFilterOpen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchText, setSearchText] = useState("");
	const [searchIndex, setSearchIndex] = useState(0);
	const [searchHitCount, setSearchHitCount] = useState(0);
	const [atBottom, setAtBottom] = useState(true);
	const [sessionStates, setSessionStates] = useState<Record<string, SessionState>>({});
	const [modelMenuOpen, setModelMenuOpen] = useState(false);
	const [modelContexts, setModelContexts] = useState<Record<string, number>>({});
	const [openModelRow, setOpenModelRow] = useState<string | null>(null);
	const [approvalOpen, setApprovalOpen] = useState(false);
	const [agentEpoch, setAgentEpoch] = useState(0);
	const [contextOpen, setContextOpen] = useState(false);
	const [contextReports, setContextReports] = useState<Record<string, ContextReport>>({});
	const [skillChips, setSkillChips] = useState<string[]>([]);
	const [skillSuggestOpen, setSkillSuggestOpen] = useState(false);
	const [skillQuery, setSkillQuery] = useState("");
	const [skillActive, setSkillActive] = useState(0);
	const [installedSkills, setInstalledSkills] = useState<SkillSummary[]>([]);
	const [resourceSuggestOpen, setResourceSuggestOpen] = useState(false);
	const [resourceQuery, setResourceQuery] = useState("");
	const [resourceActive, setResourceActive] = useState(0);
	const [entryMenuOpen, setEntryMenuOpen] = useState(false);
	const [entrySubmenu, setEntrySubmenu] = useState<"mode" | "skills" | "connectors" | null>(null);
	const [mcpConfig, setMcpConfig] = useState<McpConfigInfo | null>(null);
	const entryMenuRef = useRef<HTMLSpanElement>(null);

	const scrollRef = useRef<HTMLDivElement>(null);
	/** 输入框是非受控 contenteditable：DOM 是内容真相源，React state 只做镜像用于按钮/联想 */
	const editorRef = useRef<HTMLDivElement>(null);
	const composingRef = useRef(false);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const filterRef = useRef<HTMLSpanElement>(null);
	const clientRef = useRef<AcpClient | null>(null);
	const toolIndex = useRef<Map<string, number>>(new Map());
	const activeIdRef = useRef<string | null>(null);
	const loadedSessions = useRef<Set<string>>(new Set());
	const pendingPermissionRef = useRef<PermissionState | null>(null);
	const cancelledSessionRef = useRef<string | null>(null);
	const runningRef = useRef(false);
	const atBottomRef = useRef(true);
	/** 正在静默采集 `/context` 输出时指向该会话，期间的 chunk 不进对话 */
	const silentContextRef = useRef<{ sessionId: string; text: string } | null>(null);
	const contextBusyRef = useRef(false);
	const approvalRef = useRef<HTMLSpanElement>(null);
	const contextRef = useRef<HTMLSpanElement>(null);

	const messages = useMemo(
		() => (activeId ? messagesBySession[activeId] || [] : []),
		[activeId, messagesBySession],
	);
	const visibleMessages = messages;

	// 每次打开联想都重新读 omp 技能列表，这样面板里新装/卸载的技能即刻生效
	useEffect(() => {
		if (!skillSuggestOpen) return;
		let cancelled = false;
		void window.desktop.skills.list().then((reply) => {
			if (!cancelled && reply.ok && reply.data) setInstalledSkills(reply.data.skills);
		});
		return () => {
			cancelled = true;
		};
	}, [skillSuggestOpen]);

	const skillSuggestions = useMemo(() => {
		const query = skillQuery.trim().toLowerCase();
		const matched = query
			? installedSkills.filter(
					(skill) =>
						skill.name.toLowerCase().includes(query) ||
						skill.description.toLowerCase().includes(query),
				)
			: installedSkills;
		return matched.filter((skill) => !skillChips.includes(skill.name)).slice(0, 8);
	}, [installedSkills, skillQuery, skillChips]);

	// @ 联想候选全部来自真实数据：已打开文档、本会话工具调用出现过的路径、本会话出现过的网址、用户键入的网址
	const resourceCandidates = useMemo<ResourceCandidate[]>(() => {
		const query = resourceQuery.trim().toLowerCase();
		const list: ResourceCandidate[] = [];
		for (const doc of docs) {
			if (!doc.path) continue;
			list.push({
				value: doc.path.includes(" ") ? `@"${doc.path}"` : `@${doc.path}`,
				label: doc.name,
				group: "对话中的文件",
				detail: doc.path,
			});
		}
		for (const path of extractPathsFromMessages(messages)) {
			list.push({
				value: path.includes(" ") ? `@"${path}"` : `@${path}`,
				label: path.split(/[\\/]/).pop() || path,
				group: "对话中的资源",
				detail: path,
			});
		}
		const typed = resourceQuery.trim();
		if (/^https?:\/\/\S+\.\S+/.test(typed)) {
			list.push({ value: typed, label: urlLabel(typed), group: "网址", detail: typed });
		}
		for (const url of extractUrlsFromMessages(messages)) {
			list.push({ value: url, label: urlLabel(url), group: "网址", detail: url });
		}
		// 同一路径可能同时出现在文档和工具调用里，只保留首次出现的分组
		const seen = new Set<string>();
		const unique = list.filter((item) => {
			if (seen.has(item.value)) return false;
			seen.add(item.value);
			return true;
		});
		return (
			query
				? unique.filter(
						(item) =>
							item.label.toLowerCase().includes(query) || item.detail.toLowerCase().includes(query),
					)
				: unique
		).slice(0, 12);
	}, [docs, messages, resourceQuery]);

	const currentDoc = docs.find((doc) => doc.key === activeDoc);
	const filtersActive = statusFilter !== "all" || timeFilter !== "all";
	const report = activeId ? contextReports[activeId] : undefined;
	const contextPercent = report ? Math.min(100, Math.max(0, report.percent)) : 0;

	// omp 不返回任务状态，这里按本地会话数据推导，避免展示没有依据的状态
	const filteredSessions = useMemo(() => {
		const now = Date.now();
		const startOfToday = new Date(now);
		startOfToday.setHours(0, 0, 0, 0);

		const matchTime = (ts?: number) => {
			if (timeFilter === "all") return true;
			if (!ts) return false;
			if (timeFilter === "today") return ts >= startOfToday.getTime();
			if (timeFilter === "week") return ts >= now - 7 * 86_400_000;
			return ts >= now - 30 * 86_400_000;
		};

		const statusOf = (session: Session): StatusFilter => {
			if (running && session.id === activeId) return "running";
			const list = messagesBySession[session.id];
			// 未打开过的历史会话没有本地缓存，按已完成处理
			if (!list) return "done";
			if (!list.length) return "planned";
			const last = list[list.length - 1];
			if (last.role === "system") return "failed";
			if (last.role === "user") return "pending";
			return "done";
		};

		return sessions.filter(
			(session) =>
				matchTime(session.ts) && (statusFilter === "all" || statusOf(session) === statusFilter),
		);
	}, [sessions, statusFilter, timeFilter, messagesBySession, running, activeId]);

	useEffect(() => {
		if (!filterOpen) return;
		const onPointerDown = (event: MouseEvent) => {
			if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setFilterOpen(false);
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [filterOpen]);

	// 安全等级下拉与上下文面板：点击外部或 Esc 关闭
	useEffect(() => {
		if (!approvalOpen && !contextOpen) return;
		const onPointerDown = (event: MouseEvent) => {
			const target = event.target as Node;
			if (approvalOpen && !approvalRef.current?.contains(target)) setApprovalOpen(false);
			if (contextOpen && !contextRef.current?.contains(target)) setContextOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setApprovalOpen(false);
			setContextOpen(false);
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [approvalOpen, contextOpen]);

	// 聚合入口：点击外部或 Esc 关闭；打开时刷新技能与 MCP 配置
	useEffect(() => {
		if (!entryMenuOpen) return;
		const onPointerDown = (event: MouseEvent) => {
			if (!entryMenuRef.current?.contains(event.target as Node)) {
				setEntryMenuOpen(false);
				setEntrySubmenu(null);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setEntryMenuOpen(false);
				setEntrySubmenu(null);
			}
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		void window.desktop.skills.list().then((reply) => {
			if (reply.ok && reply.data) setInstalledSkills(reply.data.skills);
		});
		void window.desktop.mcp
			.list()
			.then(setMcpConfig)
			.catch(() => setMcpConfig(null));
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [entryMenuOpen]);

	// 模型面板打开时刷新一次容量信息（用户可能刚在设置里加过自定义模型）
	useEffect(() => {
		if (!modelMenuOpen) return;
		let cancelled = false;
		window.desktop.models
			.context()
			.then((items) => {
				if (cancelled) return;
				const map: Record<string, number> = {};
				for (const item of items) {
					if (item.contextWindow) map[item.value] = item.contextWindow;
				}
				setModelContexts(map);
			})
			.catch(() => {
				// models.yml 读不到就不显示上下文窗口，不影响模型切换
			});
		return () => {
			cancelled = true;
		};
	}, [modelMenuOpen]);

	useEffect(() => {
		if (!modelMenuOpen) return;
		const onPointerDown = (event: MouseEvent) => {
			const target = event.target as HTMLElement | null;
			if (target?.closest(".omp-model-panel") || target?.closest(".omp-model-trigger")) return;
			setModelMenuOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setModelMenuOpen(false);
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [modelMenuOpen]);

	const updateAtBottom = () => {
		const el = scrollRef.current;
		if (!el) return;
		const next = el.scrollHeight - el.scrollTop - el.clientHeight <= 24;
		atBottomRef.current = next;
		setAtBottom(next);
	};

	const scrollToBottom = () => {
		const el = scrollRef.current;
		if (!el) return;
		// 不用 smooth：动画中间帧会触发 onScroll，把尚未到底的瞬间误判成用户离开了底部
		el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
		atBottomRef.current = true;
		setAtBottom(true);
	};

	const jumpSearch = (delta: number) => {
		if (!searchHitCount) return;
		setSearchIndex((current) => (current + delta + searchHitCount) % searchHitCount);
	};

	useEffect(() => {
		if (!searchOpen || !searchText.trim()) {
			setSearchHitCount(0);
			return;
		}
		const marks = document.querySelectorAll("mark[data-search-hit]");
		setSearchHitCount(marks.length);
		setSearchIndex((current) => (marks.length ? current % marks.length : 0));
	}, [searchOpen, searchText, messages]);

	useEffect(() => {
		const marks = Array.from(document.querySelectorAll<HTMLElement>("mark[data-search-hit]"));
		marks.forEach((mark) => mark.classList.remove("omp-search-hit-active"));
		if (!searchOpen || !searchText.trim() || !marks.length) return;
		const active = marks[searchIndex % marks.length];
		active.classList.add("omp-search-hit-active");
		const fold = active.closest("details.omp-process-fold");
		if (fold) fold.setAttribute("open", "");
		requestAnimationFrame(() => {
			active.scrollIntoView({ block: "center", behavior: "smooth" });
		});
	}, [searchOpen, searchText, searchIndex, searchHitCount]);

	useEffect(() => {
		activeIdRef.current = activeId;
	}, [activeId]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
				event.preventDefault();
				setSearchOpen(true);
				requestAnimationFrame(() => {
					searchInputRef.current?.focus();
					searchInputRef.current?.select();
				});
			} else if (event.key === "Escape" && searchOpen) {
				setSearchOpen(false);
				setSearchText("");
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [searchOpen]);

	useEffect(() => {
		pendingPermissionRef.current = permission;
	}, [permission]);

	useEffect(() => {
		runningRef.current = running;
	}, [running]);

	useEffect(() => {
		const root = document.documentElement;
		root.dataset.theme = settings.theme;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const apply = () => {
			root.dataset.resolvedTheme =
				settings.theme === "system" ? (media.matches ? "dark" : "light") : settings.theme;
		};
		apply();
		media.addEventListener("change", apply);
		return () => media.removeEventListener("change", apply);
	}, [settings.theme]);

	// ---------- 非受控 contenteditable 输入区 ----------
	// chip 直接嵌在文本流里，文字会围绕它换行；React 只在 chip 增删/发送后同步 state，不回写 innerHTML
	const readEditorText = (): string => {
		const el = editorRef.current;
		if (!el) return "";
		let out = "";
		const walk = (node: Node) => {
			if (node.nodeType === Node.TEXT_NODE) {
				out += node.textContent ?? "";
				return;
			}
			if (node.nodeType !== Node.ELEMENT_NODE) return;
			const elem = node as HTMLElement;
			const skill = elem.getAttribute(SKILL_CHIP_ATTR);
			if (skill) {
				out += `/skill:${skill}`;
				return;
			}
			const resource = elem.getAttribute(RESOURCE_CHIP_ATTR);
			if (resource) {
				out += resource;
				return;
			}
			if (elem.tagName === "BR") {
				out += "\n";
				return;
			}
			if ((elem.tagName === "DIV" || elem.tagName === "P") && out && !out.endsWith("\n")) {
				out += "\n";
			}
			elem.childNodes.forEach(walk);
		};
		el.childNodes.forEach(walk);
		return out;
	};

	const syncFromEditor = () => {
		const el = editorRef.current;
		if (!el) return;
		const chips: string[] = [];
		el.querySelectorAll(`[${SKILL_CHIP_ATTR}]`).forEach((node) => {
			const name = node.getAttribute(SKILL_CHIP_ATTR);
			if (name && !chips.includes(name)) chips.push(name);
		});
		setInput(readEditorText());
		setSkillChips(chips);
	};

	const getEditorRange = (): Range | null => {
		const el = editorRef.current;
		const sel = window.getSelection();
		if (!el || !sel || sel.rangeCount === 0) return null;
		const range = sel.getRangeAt(0);
		if (!el.contains(range.startContainer)) return null;
		return range;
	};

	const focusEditor = () => {
		const el = editorRef.current;
		if (!el) return;
		el.focus();
		const sel = window.getSelection();
		const range = document.createRange();
		range.selectNodeContents(el);
		range.collapse(false);
		sel?.removeAllRanges();
		sel?.addRange(range);
	};

	const insertTextAtCursor = (text: string) => {
		const range = getEditorRange();
		if (!range) return;
		range.deleteContents();
		const node = document.createTextNode(text);
		range.insertNode(node);
		range.setStartAfter(node);
		range.collapse(true);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
	};

	const insertSkillChip = (name: string) => {
		const range = getEditorRange();
		if (!range) return;
		// 光标前正在输入的 /xxx 只是联想草稿，先删掉，避免 chip 与纯文本重复
		dropDraftBeforeCursor(range, SKILL_TOKEN_RE);
		const chip = document.createElement("span");
		chip.className = "omp-skill-chip";
		chip.setAttribute("contenteditable", "false");
		chip.setAttribute(SKILL_CHIP_ATTR, name);
		chip.title = `技能 ${name} · × 或 Backspace 删除`;
		const remove = document.createElement("span");
		remove.className = "omp-skill-chip-remove";
		remove.setAttribute("contenteditable", "false");
		remove.textContent = "×";
		const label = document.createElement("span");
		label.textContent = name;
		chip.append(remove, label);
		// 尾随空格既是与后文的间隔，也是光标锚点
		const tail = document.createTextNode(" ");
		const fragment = document.createDocumentFragment();
		fragment.append(chip, tail);
		range.insertNode(fragment);
		range.setStartAfter(tail);
		range.collapse(true);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
	};

	const removeChip = (chip: HTMLElement) => {
		const blank = chip.nextSibling;
		if (blank?.nodeType === Node.TEXT_NODE && (blank.textContent ?? "").trim() === "") {
			blank.parentNode?.removeChild(blank);
		}
		chip.remove();
		syncFromEditor();
	};

	const insertResourceChip = (candidate: ResourceCandidate) => {
		if (!getEditorRange()) focusEditor();
		const range = getEditorRange();
		if (!range) return;
		dropDraftBeforeCursor(range, RESOURCE_TOKEN_RE);
		const chip = document.createElement("span");
		chip.className = "omp-resource-chip";
		chip.setAttribute("contenteditable", "false");
		chip.setAttribute(RESOURCE_CHIP_ATTR, candidate.value);
		chip.title = `${candidate.group}：${candidate.detail} · × 或 Backspace 删除`;
		const remove = document.createElement("span");
		remove.className = "omp-skill-chip-remove";
		remove.setAttribute("contenteditable", "false");
		remove.textContent = "×";
		const label = document.createElement("span");
		label.textContent = candidate.label;
		chip.append(remove, label);
		const tail = document.createTextNode(" ");
		const fragment = document.createDocumentFragment();
		fragment.append(chip, tail);
		range.insertNode(fragment);
		range.setStartAfter(tail);
		range.collapse(true);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
		setResourceSuggestOpen(false);
		setResourceQuery("");
		syncFromEditor();
		editorRef.current?.focus();
	};

	const onEditorInput = () => {
		if (composingRef.current) return;
		syncFromEditor();
		const range = getEditorRange();
		if (!range) {
			setSkillSuggestOpen(false);
			setResourceSuggestOpen(false);
			return;
		}
		const node = range.startContainer;
		const before =
			node.nodeType === Node.TEXT_NODE && range.startOffset > 0
				? (node.textContent ?? "").slice(0, range.startOffset)
				: (node.textContent ?? "");
		const skillMatch = before.match(SKILL_TOKEN_RE);
		const resourceMatch = before.match(RESOURCE_TOKEN_RE);
		// @ 优先：@ 里可能出现的 / 不应被当成技能指令
		setResourceSuggestOpen(Boolean(resourceMatch));
		setResourceQuery(resourceMatch?.[1] ?? "");
		setResourceActive(0);
		setSkillSuggestOpen(Boolean(skillMatch) && !resourceMatch);
		setSkillQuery(skillMatch?.[1] ?? "");
		setSkillActive(0);
	};

	const onEditorBeforeInput = (event: ReactFormEvent<HTMLDivElement>) => {
		// 换行统一写成文本节点里的 \n，配合 white-space: pre-wrap；避免出现 div/br 打乱序列化
		const inputType = (event.nativeEvent as InputEvent).inputType;
		if (inputType === "insertParagraph" || inputType === "insertLineBreak") {
			event.preventDefault();
			insertTextAtCursor("\n");
			syncFromEditor();
		}
	};

	const onEditorMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
		const target = event.target as HTMLElement;
		const removeButton = target.closest(".omp-skill-chip-remove");
		if (!removeButton) return;
		event.preventDefault();
		const selector = CHIP_ATTRS.map((attr) => `[${attr}]`).join(",");
		const chip = removeButton.closest(selector);
		if (chip instanceof HTMLElement) removeChip(chip);
	};

	const onEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (resourceSuggestOpen && resourceCandidates.length > 0) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setResourceActive((current) => (current + 1) % resourceCandidates.length);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setResourceActive(
					(current) => (current - 1 + resourceCandidates.length) % resourceCandidates.length,
				);
				return;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				event.preventDefault();
				const chosen = resourceCandidates[resourceActive];
				if (chosen) insertResourceChip(chosen);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setResourceSuggestOpen(false);
				return;
			}
		}
		if (skillSuggestOpen && skillSuggestions.length > 0) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setSkillActive((current) => (current + 1) % skillSuggestions.length);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setSkillActive(
					(current) => (current - 1 + skillSuggestions.length) % skillSuggestions.length,
				);
				return;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				event.preventDefault();
				const chosen = skillSuggestions[skillActive];
				if (chosen) applySkill(chosen.name);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setSkillSuggestOpen(false);
				return;
			}
		}
		if (event.key === "Backspace") {
			const range = getEditorRange();
			if (range?.collapsed) {
				const node = range.startContainer;
				let chip: Node | null = null;
				let blank: Node | null = null;
				if (node.nodeType === Node.TEXT_NODE) {
					if (range.startOffset === 0) {
						chip = node.previousSibling;
					} else if (range.startOffset <= 1 && !(node.textContent ?? "").trim()) {
						// 光标在 chip 尾随空格里：一次 Backspace 连空格带 chip 删掉
						chip = node.previousSibling;
						blank = node;
					}
				} else {
					chip = node.childNodes[range.startOffset - 1] ?? null;
				}
				if (chip instanceof HTMLElement && CHIP_ATTRS.some((attr) => chip.hasAttribute(attr))) {
					event.preventDefault();
					if (blank) blank.parentNode?.removeChild(blank);
					removeChip(chip);
					return;
				}
			}
		}
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			void send();
		}
	};

	const updateMessages = useCallback(
		(sessionId: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
			setMessagesBySession((prev) => ({ ...prev, [sessionId]: updater(prev[sessionId] || []) }));
		},
		[],
	);

	const appendBlock = useCallback(
		(sessionId: string, block: ContentBlock, toolCallId?: string) => {
			updateMessages(sessionId, (prev) => {
				const copy = [...prev];
				let index = copy.length - 1;
				if (index < 0 || copy[index].role !== "agent") {
					copy.push({ id: uid(), role: "agent", blocks: [], ts: Date.now() });
					index = copy.length - 1;
				}
				const message = copy[index];
				const blocks = [...message.blocks];
				const last = blocks[blocks.length - 1];
				const canMergeText =
					!toolCallId &&
					last &&
					last.type === block.type &&
					(block.type === "text" || block.type === "thinking");
				if (canMergeText) {
					blocks[blocks.length - 1] = { ...last, text: last.text + block.text };
				} else {
					blocks.push(block);
				}
				copy[index] = { ...message, blocks };
				if (toolCallId) toolIndex.current.set(`${sessionId}:${toolCallId}`, index);
				return copy;
			});
		},
		[updateMessages],
	);

	const appendUserChunk = useCallback(
		(sessionId: string, text: string) => {
			updateMessages(sessionId, (prev) => {
				const copy = [...prev];
				const last = copy[copy.length - 1];
				if (last?.role === "user") {
					const blocks = [...last.blocks];
					const tail = blocks[blocks.length - 1];
					if (tail?.type === "text") {
						blocks[blocks.length - 1] = { ...tail, text: tail.text + text };
					} else {
						blocks.push({ type: "text", text });
					}
					copy[copy.length - 1] = { ...last, blocks };
					return copy;
				}
				copy.push({ id: uid(), role: "user", blocks: [{ type: "text", text }], ts: Date.now() });
				return copy;
			});
		},
		[updateMessages],
	);

	const updateToolStatus = useCallback(
		(
			sessionId: string,
			toolCallId: string,
			next: "completed" | "failed",
			result?: string,
			title?: string,
		) => {
			const index = toolIndex.current.get(`${sessionId}:${toolCallId}`);
			if (index === undefined) return;
			updateMessages(sessionId, (prev) => {
				const copy = [...prev];
				const message = copy[index];
				if (!message) return prev;
				copy[index] = {
					...message,
					blocks: message.blocks.map((block) =>
						block.type === "tool_call" && block.text === toolCallId
							? {
									...block,
									status: next,
									result: result || block.result,
									title: title || block.title,
								}
							: block,
					),
				};
				return copy;
			});
		},
		[updateMessages],
	);

	const persistSessions = useCallback(async (next: Session[]) => {
		try {
			const loaded = await window.desktop.settings.get();
			await window.desktop.sessions.set(
				next.map((session) => ({
					id: session.id,
					title: session.title,
					cwd: session.cwd || loaded.cwd,
					ts: session.ts || Date.now(),
				})),
			);
		} catch (error) {
			setStatus(`会话保存失败：${(error as Error).message}`);
		}
	}, []);

	/**
	 * 向当前会话静默发送 `/context`，解析出真实的分段用量。
	 * 命令在 omp 侧是本地执行的，不产生模型请求也不写进 transcript，
	 * 因此可以随时刷新，不会污染对话。
	 */
	const probeContext = useCallback(async (sessionId: string, target?: AcpClient | null) => {
		const acp = target ?? clientRef.current;
		if (!acp || runningRef.current || contextBusyRef.current) return;
		if (silentContextRef.current) return;
		const box = { sessionId, text: "" };
		silentContextRef.current = box;
		contextBusyRef.current = true;
		try {
			await acp.prompt(sessionId, "/context");
		} catch {
			// 旧版 omp 没有 /context 命令时静默失败，面板退化到只显示总量
		} finally {
			if (silentContextRef.current === box) silentContextRef.current = null;
			contextBusyRef.current = false;
		}
		const report = parseContextReport(box.text);
		if (report) setContextReports((prev) => ({ ...prev, [sessionId]: report }));
	}, []);

	const loadSessionHistory = useCallback(async (acp: AcpClient, sessionId: string, cwd: string) => {
		if (loadedSessions.current.has(sessionId)) return;
		loadedSessions.current.add(sessionId);
		setMessagesBySession((prev) => ({ ...prev, [sessionId]: [] }));
		try {
			const loaded = await acp.loadSession(sessionId, cwd);
			setSessionStates((prev) => ({ ...prev, [sessionId]: normalizeSessionState(loaded) }));
		} catch (error) {
			setStatus(`恢复会话失败：${(error as Error).message}`);
		}
	}, []);

	const handleEvent = useCallback(
		(event: AcpEvent) => {
			if (event.type === "notification") {
				const params = event.params as Record<string, unknown>;
				if (event.method !== "session/update") return;
				const update = params.update as Record<string, unknown> | undefined;
				if (!update) return;
				const sessionId = (params.sessionId as string) || activeIdRef.current;
				if (!sessionId) return;
				const kind = update.sessionUpdate as string;

				if (kind === "current_mode_update") {
					const modeId = String(update.currentModeId || "");
					setSessionStates((prev) => {
						const current = prev[sessionId] || { modes: null, configOptions: [] };
						return {
							...prev,
							[sessionId]: {
								...current,
								modes: current.modes ? { ...current.modes, currentModeId: modeId } : null,
							},
						};
					});
					return;
				}
				if (kind === "config_option_update") {
					const normalized = normalizeSessionState({ configOptions: update.configOptions });
					setSessionStates((prev) => {
						const current = prev[sessionId] || { modes: null, configOptions: [] };
						return {
							...prev,
							[sessionId]: { ...current, configOptions: normalized.configOptions },
						};
					});
					return;
				}

				if (kind === "usage_update") {
					// omp 每次请求结束推送一次，只有总量，没有分项；分项走 /context 解析
					const size = Number(update.size) || 0;
					const used = Number(update.used) || 0;
					setContextReports((prev) => {
						const current = prev[sessionId];
						if (current) {
							if (!size || size === current.contextWindow) return prev;
							return { ...prev, [sessionId]: { ...current, contextWindow: size } };
						}
						if (!size) return prev;
						return {
							...prev,
							[sessionId]: {
								contextWindow: size,
								usedTokens: used,
								percent: (used / size) * 100,
								parts: [],
								reservedTokens: 0,
							},
						};
					});
					return;
				}

				const content = update.content as { text?: string } | undefined;

				if (kind === "user_message_chunk" && content?.text) {
					// 历史回放会带用户消息；实时 prompt 的用户气泡已本地插入，忽略回声。
					if (!runningRef.current) appendUserChunk(sessionId, content.text);
				} else if (kind === "agent_message_chunk" && content?.text) {
					// /context 是本地命令，输出只用于解析，不写进对话
					const silent = silentContextRef.current;
					if (silent && silent.sessionId === sessionId) {
						silent.text += content.text;
						return;
					}
					appendBlock(sessionId, { type: "text", text: content.text });
				} else if (kind === "agent_thought_chunk" && content?.text) {
					appendBlock(sessionId, { type: "thinking", text: content.text });
				} else if (kind === "tool_call") {
					const toolCallId = update.toolCallId as string;
					const toolTitle = typeof update.title === "string" ? update.title : "";
					const toolKind = typeof update.kind === "string" ? update.kind : "";
					const toolName =
						typeof update.name === "string" && update.name ? update.name : toolKind || "tool";
					appendBlock(
						sessionId,
						{
							type: "tool_call",
							text: toolCallId,
							toolName,
							title: toolTitle,
							kind: toolKind,
							rawInput: formatToolInput(update.rawInput),
							result: extractText(update.content),
							status: "pending",
							raw: update,
						},
						toolCallId,
					);
				} else if (kind === "tool_call_update") {
					const toolCallId = update.toolCallId as string;
					const next = update.status as string;
					const nextTitle = typeof update.title === "string" ? update.title : undefined;
					const result = update.content !== undefined ? extractText(update.content) : undefined;
					if (next === "completed" || next === "failed") {
						updateToolStatus(
							sessionId,
							toolCallId,
							next === "completed" ? "completed" : "failed",
							result,
							nextTitle,
						);
					} else if (nextTitle || result) {
						updateMessages(sessionId, (prev) => {
							const copy = [...prev];
							for (const message of copy) {
								const idx = message.blocks.findIndex(
									(b) => b.type === "tool_call" && b.text === toolCallId,
								);
								if (idx < 0) continue;
								const block = message.blocks[idx];
								message.blocks[idx] = {
									...block,
									title: nextTitle || block.title,
									result: result || block.result,
								};
								break;
							}
							return copy;
						});
					}
				}
				return;
			}

			const params = event.params as Record<string, unknown>;
			if (event.method === "session/request_permission") {
				const toolCall = params.toolCall as { title?: string } | undefined;
				setPermission({
					sessionId: (params.sessionId as string) || "",
					title: toolCall?.title || "请求执行操作",
					options:
						(params.options as Array<{ optionId: string; name: string; kind: string }>) || [],
					respond: event.respond,
				});
				return;
			}

			const tools = window.desktop.acpTools;
			const runTool = async (task: Promise<{ ok: boolean; result?: unknown; error?: string }>) => {
				try {
					const result = await task;
					if (result.ok) event.respond(result.result ?? {});
					else event.respondError(-32000, result.error || "工具执行失败");
				} catch (error) {
					event.respondError(-32000, (error as Error).message);
				}
			};

			switch (event.method) {
				case "fs/read_text_file":
					void runTool(tools.fsRead(params));
					break;
				case "fs/write_text_file":
					void runTool(tools.fsWrite(params));
					break;
				case "terminal/create":
					void runTool(tools.terminalCreate(params));
					break;
				case "terminal/output":
					void runTool(tools.terminalOutput(params));
					break;
				case "terminal/wait_for_exit":
					void runTool(tools.terminalWait(params));
					break;
				case "terminal/kill":
					void runTool(tools.terminalKill(params));
					break;
				case "terminal/release":
					void runTool(tools.terminalRelease(params));
					break;
				default:
					event.respond({});
			}
		},
		[appendBlock, appendUserChunk, updateToolStatus, updateMessages],
	);

	useEffect(() => {
		const bridge = window.desktop;
		if (!bridge) {
			setStatus("错误：preload 未注入");
			return;
		}

		bridge.settings.get().then((loaded) => setSettings(loaded));
		bridge.onStderr((text) => setStderrLog((prev) => [...prev.slice(-80), text]));
		bridge.onExit(() => {
			setConnected(false);
			setRunning(false);
			setStatus("omp 已退出");
		});

		const acp = new AcpClient(bridge);
		acp.onEvent(handleEvent);
		clientRef.current = acp;
		setClient(acp);
		// 进程重启后会话需要重新 load，历史也要重新回放
		loadedSessions.current.clear();

		(async () => {
			const started = await acp.start();
			if (!started.ok) {
				setStatus(`启动失败：${started.error}`);
				return;
			}
			setStatus("握手中…");
			try {
				await acp.initialize();
				const loaded = await bridge.settings.get();
				const stored = await bridge.sessions.get();
				let list: Session[] = stored.map((session) => ({
					id: session.id,
					title: session.title,
					cwd: session.cwd || loaded.cwd,
					ts: session.ts,
				}));

				try {
					const remote = await acp.listSessions();
					for (const session of remote.sessions || []) {
						if (!list.some((item) => item.id === session.sessionId)) {
							list.push({
								id: session.sessionId,
								title: session.title || `会话 ${list.length + 1}`,
								cwd: session.cwd || loaded.cwd,
								ts: Date.now(),
							});
						}
					}
				} catch {
					// 某些 omp 版本没有 session/list，忽略即可。
				}

				if (list.length === 0) {
					const session = await acp.newSession(loaded.cwd);
					list = [{ id: session.sessionId, title: "会话 1", cwd: loaded.cwd, ts: Date.now() }];
					loadedSessions.current.add(session.sessionId);
					setSessionStates((prev) => ({
						...prev,
						[session.sessionId]: normalizeSessionState(session),
					}));
				}

				setSessions(list);
				void persistSessions(list);
				// 切换安全等级会重启进程，优先回到用户原先正在看的会话
				const previous = activeIdRef.current;
				const first = (previous && list.find((item) => item.id === previous)) || list[0];
				setActiveId(first.id);
				setConnected(true);
				setStatus("已连接");
				await loadSessionHistory(acp, first.id, first.cwd || loaded.cwd);
				void probeContext(first.id, acp);
			} catch (error) {
				setStatus(`握手失败：${(error as Error).message}`);
			}
		})();

		return () => acp.stop();
	}, [agentEpoch, handleEvent, loadSessionHistory, persistSessions, probeContext]);

	// 切换会话（含启动、新建）默认从底部看起；必须在布局阶段重置，否则本次提交的跟随判断会用到旧值
	useLayoutEffect(() => {
		atBottomRef.current = true;
		setAtBottom(true);
	}, [activeId]);

	useLayoutEffect(() => {
		if (!atBottomRef.current) return;
		const el = scrollRef.current;
		if (!el) return;
		// 跟随 messages 引用而非 length：流式文本是原地追加到同一个 agent 消息里的，长度不变
		el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
	}, [messages, permission, running]);

	const send = async (override?: string) => {
		// inline chip 已在 readEditorText 里还原成 omp 认识的 /skill:<name>；重试走 override 不再读输入区
		const text = (override ?? readEditorText()).trim();
		// 正在刷新上下文用量时先让出，避免两个 prompt 并发打到同一会话
		if (!client || !activeId || !text || running || contextBusyRef.current) return;
		const sessionId = activeId;
		const startedAt = Date.now();
		const userMessageId = uid();
		if (override === undefined && editorRef.current) editorRef.current.innerHTML = "";
		setInput("");
		setSkillChips([]);
		setSkillSuggestOpen(false);
		setResourceSuggestOpen(false);
		setResourceQuery("");
		atBottomRef.current = true;
		setAtBottom(true);
		updateMessages(sessionId, (prev) => [
			...prev,
			{ id: userMessageId, role: "user", blocks: [{ type: "text", text }], ts: startedAt },
		]);
		runningRef.current = true;
		setRunning(true);
		try {
			await client.prompt(sessionId, text);
		} catch (error) {
			if (cancelledSessionRef.current === sessionId) {
				cancelledSessionRef.current = null;
				return;
			}
			updateMessages(sessionId, (prev) => [
				...prev,
				{
					id: uid(),
					role: "system",
					blocks: [{ type: "text", text: `请求失败：${(error as Error).message}` }],
					ts: Date.now(),
				},
			]);
		} finally {
			if (cancelledSessionRef.current === sessionId) cancelledSessionRef.current = null;
			updateMessages(sessionId, (prev) => {
				const now = Date.now();
				const copy = prev.map((item) =>
					item.id === userMessageId ? { ...item, durationMs: now - startedAt } : item,
				);
				for (let i = copy.length - 1; i >= 0; i -= 1) {
					if (copy[i].role === "agent") {
						copy[i] = { ...copy[i], durationMs: now - copy[i].ts };
						break;
					}
				}
				return copy;
			});
			runningRef.current = false;
			setRunning(false);
			focusEditor();
			// 一轮结束后刷新上下文占用（工具输出、消息都会变化）
			void probeContext(sessionId);
		}
	};

	const retryMessage = (message: ChatMessage) => {
		const text = message.blocks
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("\n")
			.trim();
		if (text) void send(text);
	};

	const cancel = () => {
		if (!client || !activeId) return;
		cancelledSessionRef.current = activeId;
		client.cancel(activeId);
		const pending = pendingPermissionRef.current;
		if (pending?.sessionId === activeId) {
			pending.respond({ outcome: { outcome: "cancelled" } });
			setPermission(null);
		}
		runningRef.current = false;
		setRunning(false);
	};

	const selectSession = async (session: Session) => {
		setActiveId(session.id);
		setRunning(false);
		if (client && !loadedSessions.current.has(session.id)) {
			const loaded = await window.desktop.settings.get();
			await loadSessionHistory(client, session.id, session.cwd || loaded.cwd);
			void probeContext(session.id, client);
		}
	};

	/** 切换安全等级：omp 只接受启动参数，因此要重启 ACP 进程并恢复当前会话 */
	const changeApprovalMode = async (mode: ApprovalMode) => {
		setApprovalOpen(false);
		if (mode === settings.approvalMode) return;
		if (running) {
			setStatus("任务运行中，结束后再切换安全等级");
			return;
		}
		setSettings((prev) => ({ ...prev, approvalMode: mode }));
		try {
			await window.desktop.settings.set({ approvalMode: mode });
		} catch (error) {
			setStatus(`安全等级保存失败：${(error as Error).message}`);
			return;
		}
		setStatus(`安全等级已切换为「${APPROVAL_LABEL[mode]}」，正在重连 omp…`);
		setConnected(false);
		setAgentEpoch((value) => value + 1);
	};

	const newSession = async () => {
		if (!client) return;
		try {
			const loaded = await window.desktop.settings.get();
			const session = await client.newSession(loaded.cwd);
			const next: Session[] = [
				...sessions,
				{
					id: session.sessionId,
					title: `会话 ${sessions.length + 1}`,
					cwd: loaded.cwd,
					ts: Date.now(),
				},
			];
			loadedSessions.current.add(session.sessionId);
			setSessionStates((prev) => ({
				...prev,
				[session.sessionId]: normalizeSessionState(session),
			}));
			setSessions(next);
			void persistSessions(next);
			// 空会话在筛选里算「规划中」，所以显式登记空消息列表
			setMessagesBySession((prev) => ({ ...prev, [session.sessionId]: [] }));
			setActiveId(session.sessionId);
			setRunning(false);
		} catch (error) {
			setStatus(`新建会话失败：${(error as Error).message}`);
		}
	};

	const changeMode = async (modeId: string) => {
		if (!client || !activeId) return;
		try {
			await client.setMode(activeId, modeId);
			setSessionStates((prev) => {
				const current = prev[activeId] || { modes: null, configOptions: [] };
				return {
					...prev,
					[activeId]: {
						...current,
						modes: current.modes ? { ...current.modes, currentModeId: modeId } : null,
					},
				};
			});
		} catch (error) {
			setStatus(`切换档位失败：${(error as Error).message}`);
		}
	};

	const changeConfigOption = async (optionId: string, value: string | boolean) => {
		if (!client || !activeId) return;
		try {
			await client.setConfigOption(activeId, optionId, value);
			setSessionStates((prev) => {
				const current = prev[activeId] || { modes: null, configOptions: [] };
				return {
					...prev,
					[activeId]: {
						...current,
						configOptions: current.configOptions.map((option) =>
							option.id === optionId
								? {
										...option,
										currentValue: typeof value === "string" ? value : option.currentValue,
										currentBoolean: typeof value === "boolean" ? value : option.currentBoolean,
									}
								: option,
						),
					},
				};
			});
		} catch (error) {
			setStatus(`切换配置失败：${(error as Error).message}`);
		}
	};

	const saveSettings = async () => {
		try {
			await window.desktop.settings.set(settings);
			setShowSettings(false);
			setStatus("设置已保存");
		} catch (error) {
			setStatus(`设置保存失败：${(error as Error).message}`);
		}
	};

	const openDoc = (name: string, content: string, path?: string, language?: string) => {
		const key = path || `snippet:${uid()}`;
		setDocs((prev) => [
			...prev.filter((doc) => doc.key !== key),
			{ key, name, content, path, language },
		]);
		setActiveDoc(key);
		setShowPreview(true);
	};

	const openLocalFile = async () => {
		try {
			const file = await window.desktop.files.open();
			if (!file) return;
			openDoc(file.name, file.content, file.path, file.language);
		} catch (error) {
			setStatus(`打开文件失败：${(error as Error).message}`);
		}
	};

	const insertFileReference = async () => {
		try {
			const file = await window.desktop.files.open();
			if (!file) return;
			insertResourceChip({
				value: file.path.includes(" ") ? `@"${file.path}"` : `@${file.path}`,
				label: file.name,
				group: "对话中的文件",
				detail: file.path,
			});
		} catch (error) {
			setStatus(`引用文件失败：${(error as Error).message}`);
		}
	};

	const applySkill = (name: string) => {
		if (!getEditorRange()) focusEditor();
		insertSkillChip(name);
		setSkillSuggestOpen(false);
		setSkillQuery("");
		syncFromEditor();
		editorRef.current?.focus();
	};

	const openResourceSuggest = () => {
		if (!getEditorRange()) focusEditor();
		insertTextAtCursor("@");
		onEditorInput();
		editorRef.current?.focus();
	};

	const reloadDoc = async () => {
		if (!currentDoc?.path) return;
		try {
			const file = await window.desktop.files.read(currentDoc.path);
			setDocs((prev) =>
				prev.map((doc) =>
					doc.key === currentDoc.key
						? { ...doc, content: file.content, language: file.language }
						: doc,
				),
			);
		} catch (error) {
			setStatus(`刷新文件失败：${(error as Error).message}`);
		}
	};

	const closeDoc = (key: string) => {
		setDocs((prev) => {
			const next = prev.filter((doc) => doc.key !== key);
			if (activeDoc === key) setActiveDoc(next[0]?.key || null);
			return next;
		});
	};

	const activeTitle = sessions.find((session) => session.id === activeId)?.title || "新会话";
	const activeState = activeId ? sessionStates[activeId] : undefined;
	const modelOption = activeState?.configOptions.find(
		(option) =>
			option.category === "model" ||
			(!option.category &&
				option.options?.some((item) => /gpt|claude|glm|kimi|qwen|deepseek|model/i.test(item.name))),
	);
	const thoughtOption = activeState?.configOptions.find(
		(option) => option.category === "thought_level",
	);
	const otherSelects =
		activeState?.configOptions.filter(
			(option) =>
				option.id !== modelOption?.id &&
				option.id !== thoughtOption?.id &&
				option.category !== "mode",
		) || [];
	const currentModeName = activeState?.modes?.availableModes.find(
		(mode) => mode.id === activeState.modes?.currentModeId,
	)?.name;
	const currentModelName =
		modelOption?.options?.find((item) => item.value === modelOption.currentValue)?.name ||
		modelOption?.currentValue;
	/** ACP 返回的模型名形如「kcoder-glm-flash · GLM-5.3-Flash」，底部只留型号 */
	const shortModelName =
		(currentModelName || "").split("·").pop()?.trim() || currentModelName || "";

	// 模型详情面板只列模型相关能力；运行模式已移到输入区的「添加」聚合菜单
	const modelRows: ModelRow[] = [];
	if (thoughtOption?.options && thoughtOption.options.length > 0) {
		modelRows.push({
			id: thoughtOption.id,
			label: "思考强度",
			valueLabel: pickLabel(THINKING_LABEL, thoughtOption.currentValue),
			currentValue: thoughtOption.currentValue,
			options: thoughtOption.options.map((item) => ({
				value: item.value,
				label: pickLabel(THINKING_LABEL, item.value, item.name),
			})),
			onSelect: (value) => void changeConfigOption(thoughtOption.id, value),
		});
	}
	for (const option of otherSelects) {
		if (option.type === "boolean") {
			modelRows.push({
				id: option.id,
				label: option.name,
				valueLabel: option.currentBoolean ? "已开启" : "已关闭",
				onSelect: () => void changeConfigOption(option.id, !option.currentBoolean),
			});
			continue;
		}
		if (!option.options || option.options.length === 0) continue;
		modelRows.push({
			id: option.id,
			label: option.name,
			valueLabel:
				option.options.find((item) => item.value === option.currentValue)?.name ||
				option.currentValue ||
				"",
			currentValue: option.currentValue,
			options: option.options.map((item) => ({ value: item.value, label: item.name })),
			onSelect: (value) => void changeConfigOption(option.id, value),
		});
	}
	const currentContext = modelOption?.currentValue
		? modelContexts[modelOption.currentValue]
		: undefined;
	const activeRow = modelRows.find((row) => row.id === openModelRow);

	return (
		<div className="omp-app">
			<header className="omp-titlebar">
				<div className="omp-titlebar-left">
					<span className="omp-title-tip">
						<button
							type="button"
							className={`omp-title-action ${sidebarCollapsed ? "active" : ""}`}
							onClick={() => setSidebarCollapsed((value) => !value)}
							aria-label="切换侧栏"
						>
							<Icon name="sidebar" size={14} />
						</button>
						<span className="omp-tooltip" role="tooltip">
							{sidebarCollapsed ? "显示侧栏" : "收起侧栏"}
						</span>
					</span>
					<span className="omp-title-tip omp-filter-wrap" ref={filterRef}>
						<button
							type="button"
							className={`omp-title-action ${filterOpen ? "active" : ""} ${filtersActive ? "filtered" : ""}`}
							onClick={() => setFilterOpen((value) => !value)}
							aria-label="筛选任务状态"
							aria-haspopup="menu"
							aria-expanded={filterOpen}
						>
							<Icon name="filter" size={14} />
							{filtersActive && <span className="omp-filter-dot" />}
						</button>
						<span className="omp-tooltip" role="tooltip">
							筛选任务状态
						</span>
						{filterOpen && (
							<div className="omp-filter-menu" role="menu">
								<div className="omp-filter-group">
									<span className="omp-filter-label">筛选状态</span>
									{STATUS_FILTERS.map((item) => (
										<button
											key={item.value}
											type="button"
											role="menuitemradio"
											aria-checked={statusFilter === item.value}
											className={`omp-filter-item ${statusFilter === item.value ? "active" : ""}`}
											onClick={() => {
												setStatusFilter(item.value);
												setFilterOpen(false);
											}}
										>
											<span>{item.label}</span>
											{statusFilter === item.value && <Icon name="check" size={14} />}
										</button>
									))}
								</div>
								<div className="omp-filter-group">
									<span className="omp-filter-label">筛选时间</span>
									{TIME_FILTERS.map((item) => (
										<button
											key={item.value}
											type="button"
											role="menuitemradio"
											aria-checked={timeFilter === item.value}
											className={`omp-filter-item ${timeFilter === item.value ? "active" : ""}`}
											onClick={() => {
												setTimeFilter(item.value);
												setFilterOpen(false);
											}}
										>
											<span>{item.label}</span>
											{timeFilter === item.value && <Icon name="check" size={14} />}
										</button>
									))}
								</div>
								<button
									type="button"
									className="omp-filter-reset"
									disabled={!filtersActive}
									onClick={() => {
										setStatusFilter("all");
										setTimeFilter("all");
									}}
								>
									重置筛选条件
								</button>
							</div>
						)}
					</span>
					<span className="omp-title-divider" />
					<strong className="omp-title-session" title={activeTitle}>
						{activeTitle}
					</strong>
				</div>
				<div className="omp-titlebar-right">
					<span className={`omp-connection ${connected ? "online" : "offline"}`} title={status}>
						<span className="omp-connection-dot" />
						{connected ? "已连接" : "未连接"}
					</span>
					<span className="omp-title-divider" />
					<span className="omp-title-tip">
						<button
							type="button"
							className={`omp-title-action ${searchOpen ? "active" : ""}`}
							onClick={() => {
								setSearchOpen((value) => !value);
								if (searchOpen) setSearchText("");
							}}
							aria-label="对话内搜索，快捷键 Ctrl+F"
						>
							<Icon name="search" size={14} />
						</button>
						<span className="omp-tooltip" role="tooltip">
							对话内搜索 <kbd>Ctrl+F</kbd>
						</span>
					</span>
					<button
						type="button"
						className={`omp-title-action ${showPreview ? "active" : ""}`}
						onClick={() => setShowPreview((value) => !value)}
						title={showPreview ? "隐藏文件预览" : "显示文件预览"}
						aria-label="切换文件预览"
					>
						<Icon name="panel" size={14} />
					</button>
					<span className="omp-title-divider" />
					<div className="omp-window-controls">
						<button
							type="button"
							onClick={() => window.desktop.window.minimize()}
							title="最小化"
							aria-label="最小化"
						>
							<Icon name="minimize" size={12} />
						</button>
						<button
							type="button"
							onClick={() => window.desktop.window.maximize()}
							title="最大化 / 还原"
							aria-label="最大化或还原"
						>
							<Icon name="maximize" size={12} />
						</button>
						<button
							type="button"
							className="close"
							onClick={() => window.desktop.window.close()}
							title="关闭"
							aria-label="关闭"
						>
							<Icon name="close" size={12} />
						</button>
					</div>
				</div>
			</header>

			<div className="omp-workspace">
				<aside
					className={`omp-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}
					aria-hidden={sidebarCollapsed}
				>
					<div className="omp-sidebar-nav">
						<button
							type="button"
							className="omp-nav-primary"
							onClick={newSession}
							disabled={!connected}
						>
							<Icon name="plus" size={16} />
							<span>新建任务</span>
						</button>
						<div className="omp-nav-static">
							<Icon name="chat" size={16} />
							<span>助理</span>
							<em>本地</em>
						</div>
						<button
							type="button"
							className="omp-nav-static"
							onClick={() => setShowSkills(true)}
							title="搜索、安装与管理 omp 技能"
						>
							<Icon name="layers" size={16} />
							<span>技能</span>
						</button>
					</div>

					<div className="omp-sidebar-section">
						<div className="omp-view-tabs" role="tablist" aria-label="会话视图">
							<button
								type="button"
								role="tab"
								aria-selected={sidebarView === "recent"}
								className={sidebarView === "recent" ? "active" : ""}
								onClick={() => setSidebarView("recent")}
							>
								<Icon name="clock" size={13} /> 最近
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={sidebarView === "grouped"}
								className={sidebarView === "grouped" ? "active" : ""}
								onClick={() => setSidebarView("grouped")}
							>
								<Icon name="grid" size={13} /> 分组
							</button>
						</div>

						{sidebarView === "recent" ? (
							<div className="omp-session-list">
								{filteredSessions.length === 0 && (
									<div className="omp-list-empty">
										{filtersActive ? "没有符合条件的会话" : "还没有会话"}
									</div>
								)}
								{filteredSessions.map((session) => (
									<button
										key={session.id}
										type="button"
										className={`omp-session ${session.id === activeId ? "active" : ""}`}
										onClick={() => void selectSession(session)}
										title={session.title}
									>
										<Icon name="chat" size={14} />
										<span className="omp-session-title">{session.title}</span>
										{running && session.id === activeId ? (
											<span className="omp-session-spinner" title="运行中" />
										) : (
											<time>{relativeTime(session.ts)}</time>
										)}
									</button>
								))}
							</div>
						) : (
							<div className="omp-session-list">
								{filteredSessions.length === 0 && (
									<div className="omp-list-empty">
										{filtersActive ? "没有符合条件的会话" : "还没有会话"}
									</div>
								)}
								{Object.entries(
									filteredSessions.reduce<Record<string, Session[]>>((groups, session) => {
										const key = dirName(session.cwd || settings.cwd);
										(groups[key] ||= []).push(session);
										return groups;
									}, {}),
								).map(([group, items]) => (
									<div key={group} className="omp-session-group">
										<div className="omp-group-head">
											<Icon name="folder" size={14} />
											<span>{group}</span>
											<span className="omp-count">{items.length}</span>
										</div>
										{items.map((session) => (
											<button
												key={session.id}
												type="button"
												className={`omp-session grouped ${session.id === activeId ? "active" : ""}`}
												onClick={() => void selectSession(session)}
												title={session.title}
											>
												<span className="omp-session-title">{session.title}</span>
												{running && session.id === activeId ? (
													<span className="omp-session-spinner" title="运行中" />
												) : (
													<time>{relativeTime(session.ts)}</time>
												)}
											</button>
										))}
									</div>
								))}
							</div>
						)}
					</div>

					<div className="omp-sidebar-footer">
						<div className="omp-workdir" title={settings.cwd}>
							<Icon name="folder" size={14} />
							<span>{shortPath(settings.cwd)}</span>
						</div>
						<button
							type="button"
							className="omp-sidebar-setting"
							onClick={() => setShowSettings(true)}
						>
							<Icon name="settings" size={14} />
							设置
						</button>
					</div>
				</aside>

				<main className="omp-main">
					<div className="omp-content">
						<section className="omp-chat">
							{searchOpen && (
								<div className="omp-searchbar" role="search">
									<Icon name="search" size={15} />
									<input
										ref={searchInputRef}
										autoFocus
										value={searchText}
										onChange={(event) => {
											setSearchText(event.target.value);
											setSearchIndex(0);
										}}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												event.preventDefault();
												jumpSearch(event.shiftKey ? -1 : 1);
											}
										}}
										placeholder="搜索对话内容"
										aria-label="搜索对话内容"
									/>
									{searchText && (
										<span className="omp-search-count">
											{searchHitCount ? searchIndex + 1 : 0}/{searchHitCount}
										</span>
									)}
									<button
										type="button"
										className="omp-search-nav"
										onClick={() => jumpSearch(-1)}
										disabled={!searchHitCount}
										title="上一处"
										aria-label="上一处搜索结果"
									>
										<Icon name="chevron" size={13} className="omp-search-up" />
									</button>
									<button
										type="button"
										className="omp-search-nav"
										onClick={() => jumpSearch(1)}
										disabled={!searchHitCount}
										title="下一处"
										aria-label="下一处搜索结果"
									>
										<Icon name="chevron" size={13} />
									</button>
									<button
										type="button"
										className="omp-search-close"
										onClick={() => {
											setSearchOpen(false);
											setSearchText("");
										}}
										title="关闭搜索"
										aria-label="关闭搜索"
									>
										<Icon name="close" size={13} />
									</button>
								</div>
							)}
							<div className="omp-messages-wrap">
								<div className="omp-messages" ref={scrollRef} onScroll={updateAtBottom}>
									{visibleMessages.length === 0 && (
										<div className="omp-empty">
											<div className="omp-empty-mark">
												<Icon name="spark" size={28} />
											</div>
											<h2>把任务交给 omp</h2>
											<p>它会在当前工作目录中读取文件、执行命令，并把过程展现在这里。</p>
											<div className="omp-empty-hints">
												{[
													"解释当前目录的代码结构",
													"帮我修复一个失败的测试",
													"梳理这个项目的待办事项",
												].map((hint) => (
													<button
														key={hint}
														type="button"
														onClick={() => {
															if (!getEditorRange()) focusEditor();
															insertTextAtCursor(hint);
															syncFromEditor();
															editorRef.current?.focus();
														}}
													>
														{hint}
														<Icon name="chevron-right" size={12} />
													</button>
												))}
											</div>
										</div>
									)}

									{visibleMessages.map((message, messageIndex) => {
										const hasPendingTool = message.blocks.some(
											(block) => block.type === "tool_call" && block.status === "pending",
										);
										const isActive = running && messageIndex === visibleMessages.length - 1;
										const generating = message.role === "agent" && (isActive || hasPendingTool);
										let splitAt = message.blocks.length;
										while (splitAt > 0 && message.blocks[splitAt - 1].type === "text") splitAt -= 1;
										const processBlocks = message.blocks.slice(0, splitAt);
										const finalBlocks = message.blocks.slice(splitAt);
										const hasProcessFold =
											message.role === "agent" &&
											processBlocks.length > 0 &&
											finalBlocks.length > 0 &&
											!isActive;
										const contentBlocks = hasProcessFold ? finalBlocks : message.blocks;
										return (
											<article
												key={message.id}
												className={`omp-message ${message.role}`}
												data-message-id={message.id}
											>
												<div className="omp-message-avatar">
													{message.role === "user" ? (
														"你"
													) : message.role === "agent" ? (
														<Icon name="spark" size={13} />
													) : (
														<Icon name="warning" size={13} />
													)}
												</div>
												<div className="omp-message-body">
													<div className="omp-message-meta">
														<span>
															{message.role === "user"
																? "你"
																: message.role === "agent"
																	? "omp"
																	: "系统"}
														</span>
														<time>
															{new Date(message.ts).toLocaleTimeString("zh-CN", {
																hour: "2-digit",
																minute: "2-digit",
															})}
														</time>
														{message.role === "user" && message.durationMs !== undefined && (
															<span className="omp-duration">
																<Icon name="check" size={11} /> 已完成{" "}
																{formatDuration(message.durationMs)}
															</span>
														)}
													</div>
													{message.role === "agent" &&
														(hasProcessFold ? (
															<details className="omp-process-fold">
																<summary className="omp-agent-status">
																	<Icon name="check" size={11} />
																	<span>
																		已完成
																		{message.durationMs !== undefined
																			? ` ${formatDuration(message.durationMs)}`
																			: ""}
																	</span>
																	<span className="omp-process-hint">查看处理过程</span>
																	<Icon name="chevron" size={12} className="omp-fold-chevron" />
																</summary>
																<div className="omp-process-body">
																	{processBlocks.map((block, blockIndex) => (
																		<Block
																			key={blockIndex}
																			block={block}
																			onOpenDoc={openDoc}
																			query={searchText.trim()}
																		/>
																	))}
																</div>
															</details>
														) : (
															<div className={`omp-agent-status ${generating ? "busy" : ""}`}>
																<Icon name={generating ? "spark" : "check"} size={11} />
																{generating ? "生成中" : "已完成"}
															</div>
														))}
													{contentBlocks.length > 0 && (
														<div className="omp-message-content">
															{contentBlocks.map((block, blockIndex) => (
																<Block
																	key={blockIndex}
																	block={block}
																	onOpenDoc={openDoc}
																	query={searchText.trim()}
																/>
															))}
														</div>
													)}
													<MessageActions
														text={message.blocks.map((block) => block.text).join("\n")}
														onRetry={
															message.role === "user" ? () => retryMessage(message) : undefined
														}
													/>
												</div>
											</article>
										);
									})}

									{running && (
										<div className="omp-typing">
											<span className="omp-typing-dots">
												<i />
												<i />
												<i />
											</span>
											omp 正在处理
										</div>
									)}
								</div>
								{!atBottom && (
									<div className="omp-scroll-bottom">
										<button
											type="button"
											onClick={scrollToBottom}
											title="回到最底部"
											aria-label="回到最底部"
										>
											<Icon name="chevron" size={16} />
										</button>
									</div>
								)}
							</div>

							<div className="omp-composer-wrap">
								<div className="omp-composer">
									{resourceSuggestOpen && (
										<div
											className="omp-skill-suggest"
											role="listbox"
											aria-label="资源联想"
											onMouseDown={(event) => event.preventDefault()}
										>
											<div className="omp-skill-suggest-head">
												引用资源 ({resourceCandidates.length})
											</div>
											{resourceCandidates.length === 0 ? (
												<div className="omp-skill-suggest-empty">
													暂无可引用的文件/网址，可直接粘贴网址或选择本地文件
												</div>
											) : (
												resourceCandidates.map((candidate, index) => (
													<button
														key={`${candidate.group}:${candidate.value}`}
														type="button"
														role="option"
														aria-selected={index === resourceActive}
														className={`omp-skill-suggest-item ${
															index === resourceActive ? "active" : ""
														}`}
														onMouseEnter={() => setResourceActive(index)}
														onClick={() => insertResourceChip(candidate)}
													>
														<span className="omp-skill-suggest-icon">
															{candidate.group === "网址" ? (
																<Icon name="link" size={13} />
															) : (
																<Icon name="file" size={13} />
															)}
														</span>
														<span className="omp-skill-suggest-main">
															<strong>{candidate.label}</strong>
															<span>
																{candidate.group} · {candidate.detail}
															</span>
														</span>
													</button>
												))
											)}
											<button
												type="button"
												className="omp-skill-suggest-action"
												onClick={() => {
													setResourceSuggestOpen(false);
													void insertFileReference();
												}}
											>
												<Icon name="folder" size={13} /> 从本地选择文件…
											</button>
										</div>
									)}
									{skillSuggestOpen && (
										<div
											className="omp-skill-suggest"
											role="listbox"
											aria-label="技能联想"
											onMouseDown={(event) => event.preventDefault()}
										>
											<div className="omp-skill-suggest-head">技能 ({skillSuggestions.length})</div>
											{skillSuggestions.length === 0 ? (
												<div className="omp-skill-suggest-empty">没有匹配的已安装技能</div>
											) : (
												skillSuggestions.map((skill, index) => (
													<button
														key={skill.name}
														type="button"
														role="option"
														aria-selected={index === skillActive}
														className={`omp-skill-suggest-item ${
															index === skillActive ? "active" : ""
														}`}
														onMouseEnter={() => setSkillActive(index)}
														onClick={() => applySkill(skill.name)}
													>
														<span className="omp-skill-suggest-icon">
															{skill.name.slice(0, 1).toUpperCase()}
														</span>
														<span className="omp-skill-suggest-main">
															<strong>{skill.name}</strong>
															<span>{skill.description}</span>
														</span>
													</button>
												))
											)}
										</div>
									)}
									<div
										ref={editorRef}
										className="omp-composer-input"
										contentEditable={connected && !running}
										suppressContentEditableWarning
										role="textbox"
										aria-multiline="true"
										aria-label="任务输入框"
										data-placeholder={connected ? "描述任务，按 Enter 发送" : "等待连接 omp…"}
										onInput={onEditorInput}
										onBeforeInput={onEditorBeforeInput}
										onKeyDown={onEditorKeyDown}
										onMouseDown={onEditorMouseDown}
										onCompositionStart={() => {
											composingRef.current = true;
										}}
										onCompositionEnd={() => {
											composingRef.current = false;
											onEditorInput();
										}}
										onBlur={() => setSkillSuggestOpen(false)}
									/>
									<div className="omp-composer-footer">
										<div className="omp-composer-hint">
											<span className="omp-entry-wrap" ref={entryMenuRef}>
												<button
													type="button"
													className={`omp-reference ${entryMenuOpen ? "active" : ""}`}
													onClick={() => {
														setEntrySubmenu(null);
														setEntryMenuOpen((value) => !value);
													}}
													title="添加文件、引用资源、模式、技能与连接器"
													aria-haspopup="menu"
													aria-expanded={entryMenuOpen}
												>
													<Icon name="plus" size={13} />
													<span className="omp-btn-label">添加</span>
												</button>
												{entryMenuOpen && (
													<div className="omp-entry-menu" role="menu" aria-label="添加与引用">
														<button
															type="button"
															role="menuitem"
															className="omp-entry-item"
															onClick={() => {
																setEntryMenuOpen(false);
																void insertFileReference();
															}}
														>
															<Icon name="folder" size={14} />
															<span>添加文件</span>
															<span className="omp-entry-item-hint">从本地选择</span>
														</button>
														<button
															type="button"
															role="menuitem"
															className="omp-entry-item"
															onClick={() => {
																setEntryMenuOpen(false);
																openResourceSuggest();
															}}
														>
															<Icon name="file" size={14} />
															<span>引用资源</span>
															<span className="omp-entry-item-hint">文件 / 网址</span>
														</button>
														<button
															type="button"
															role="menuitem"
															className={`omp-entry-item ${entrySubmenu === "mode" ? "active" : ""}`}
															onClick={() =>
																setEntrySubmenu((value) => (value === "mode" ? null : "mode"))
															}
														>
															<Icon name="rotate" size={14} />
															<span>模式</span>
															<span className="omp-entry-item-hint">{currentModeName}</span>
															<Icon name="chevron-right" size={12} />
														</button>
														<button
															type="button"
															role="menuitem"
															className={`omp-entry-item ${entrySubmenu === "skills" ? "active" : ""}`}
															onClick={() =>
																setEntrySubmenu((value) => (value === "skills" ? null : "skills"))
															}
														>
															<Icon name="spark" size={14} />
															<span>技能</span>
															<span className="omp-entry-item-hint">{installedSkills.length}</span>
															<Icon name="chevron-right" size={12} />
														</button>
														<button
															type="button"
															role="menuitem"
															className={`omp-entry-item ${entrySubmenu === "connectors" ? "active" : ""}`}
															onClick={() =>
																setEntrySubmenu((value) =>
																	value === "connectors" ? null : "connectors",
																)
															}
														>
															<Icon name="layers" size={14} />
															<span>连接器</span>
															<span className="omp-entry-item-hint">
																{mcpConfig?.servers.length ?? 0}
															</span>
															<Icon name="chevron-right" size={12} />
														</button>
														{entrySubmenu && (
															<div className="omp-entry-submenu">
																{entrySubmenu === "mode" && (
																	<>
																		<div className="omp-entry-subhead">运行模式</div>
																		{(activeState?.modes?.availableModes || []).map((mode) => (
																			<button
																				key={mode.id}
																				type="button"
																				className={`omp-entry-subitem ${
																					mode.id === activeState?.modes?.currentModeId
																						? "active"
																						: ""
																				}`}
																				onClick={() => {
																					void changeMode(mode.id);
																					setEntryMenuOpen(false);
																					setEntrySubmenu(null);
																				}}
																			>
																				<span>{pickLabel(MODE_LABEL, mode.id, mode.name)}</span>
																				{mode.id === activeState?.modes?.currentModeId && (
																					<Icon name="check" size={13} />
																				)}
																			</button>
																		))}
																		{!activeState?.modes?.availableModes.length && (
																			<div className="omp-entry-empty">当前会话未提供模式切换</div>
																		)}
																	</>
																)}
																{entrySubmenu === "skills" && (
																	<>
																		<div className="omp-entry-subhead">已安装技能</div>
																		{installedSkills.slice(0, 12).map((skill) => (
																			<button
																				key={skill.name}
																				type="button"
																				className="omp-entry-subitem"
																				onClick={() => {
																					applySkill(skill.name);
																					setEntryMenuOpen(false);
																					setEntrySubmenu(null);
																				}}
																			>
																				<span>{skill.name}</span>
																			</button>
																		))}
																		{!installedSkills.length && (
																			<div className="omp-entry-empty">暂无已安装技能</div>
																		)}
																		<button
																			type="button"
																			className="omp-entry-subitem manage"
																			onClick={() => {
																				setEntryMenuOpen(false);
																				setEntrySubmenu(null);
																				setShowSkills(true);
																			}}
																		>
																			<Icon name="settings" size={12} />
																			<span>管理技能…</span>
																		</button>
																	</>
																)}
																{entrySubmenu === "connectors" && (
																	<>
																		<div className="omp-entry-subhead">MCP 连接器</div>
																		{(mcpConfig?.servers || []).map((server) => (
																			<div
																				key={`${server.scope}:${server.name}`}
																				className="omp-entry-subitem static"
																				title={server.source}
																			>
																				<span>{server.name}</span>
																				<span className="omp-entry-server-meta">
																					{server.scope === "user" ? "全局" : "项目"} ·{" "}
																					{server.transport}
																					{server.enabled ? "" : " · 已禁用"}
																				</span>
																			</div>
																		))}
																		{!mcpConfig?.servers.length && (
																			<div className="omp-entry-empty">
																				未配置连接器；omp 从 .omp/mcp.json 读取
																			</div>
																		)}
																	</>
																)}
															</div>
														)}
													</div>
												)}
											</span>
											<span className="omp-path-label" title={settings.cwd}>
												{shortPath(settings.cwd)}
											</span>
										</div>
										<div className="omp-composer-tools">
											<span className="omp-approval-wrap" ref={approvalRef}>
												<button
													type="button"
													className={`omp-approval-trigger ${approvalOpen ? "active" : ""}`}
													onClick={() => setApprovalOpen((value) => !value)}
													title={`安全等级：${APPROVAL_LABEL[settings.approvalMode]}`}
													aria-label="安全等级"
													aria-haspopup="menu"
													aria-expanded={approvalOpen}
												>
													<Icon name="shield" size={13} />
													<span className="omp-btn-label">
														{APPROVAL_LABEL[settings.approvalMode]}
													</span>
													<Icon name="chevron" size={12} />
												</button>
												{approvalOpen && (
													<div className="omp-approval-menu" role="menu" aria-label="安全等级">
														{APPROVAL_OPTIONS.map((mode) => (
															<button
																key={mode}
																type="button"
																role="menuitemradio"
																aria-checked={settings.approvalMode === mode}
																className={`omp-approval-item ${
																	settings.approvalMode === mode ? "active" : ""
																}`}
																onClick={() => void changeApprovalMode(mode)}
															>
																<span className="omp-approval-item-main">
																	<span>{APPROVAL_LABEL[mode]}</span>
																	{settings.approvalMode === mode && (
																		<Icon name="check" size={13} />
																	)}
																</span>
																<span className="omp-approval-item-hint">
																	{APPROVAL_HINT[mode]}
																</span>
															</button>
														))}
													</div>
												)}
											</span>
											<button
												type="button"
												className={`omp-model-trigger ${modelMenuOpen ? "active" : ""}`}
												onClick={() => {
													setOpenModelRow(null);
													setModelMenuOpen((value) => !value);
												}}
												title="模型与推理档位"
												aria-label="模型与推理档位"
											>
												<Icon name="spark" size={13} />
												<span className="omp-model-label">{currentModelName || "模型"}</span>
												<Icon name="chevron" size={12} />
											</button>
											<span className="omp-context-wrap" ref={contextRef}>
												<button
													type="button"
													className={`omp-context-trigger ${contextOpen ? "active" : ""} ${
														contextPercent >= 85 ? "danger" : contextPercent >= 60 ? "warn" : ""
													}`}
													onClick={() => {
														const next = !contextOpen;
														setContextOpen(next);
														if (next && activeId) void probeContext(activeId);
													}}
													title={
														report ? `上下文已用 ${report.percent.toFixed(1)}%` : "查看上下文用量"
													}
													aria-label="上下文用量"
												>
													<ContextRing percent={contextPercent} />
												</button>
												{contextOpen && (
													<div className="omp-context-panel" role="dialog" aria-label="上下文用量">
														<div className="omp-context-head">
															<span>上下文用量</span>
															<button
																type="button"
																className="omp-context-close"
																onClick={() => setContextOpen(false)}
																aria-label="关闭"
															>
																<Icon name="close" size={13} />
															</button>
														</div>
														<div className="omp-context-total">
															<strong>{report ? `${report.percent.toFixed(1)}%` : "—"}</strong>
															<span>
																{report
																	? `已使用 ${formatTokens(report.usedTokens)} / ${formatContext(report.contextWindow)}`
																	: "正在读取 omp 上下文统计…"}
															</span>
														</div>
														{report && <ContextMeter report={report} />}
														<div className="omp-context-foot">
															{report
																? `${formatContext(report.contextWindow)} 上下文`
																: "上下文窗口未知"}
															{shortModelName ? ` · ${shortModelName}` : ""}
														</div>
													</div>
												)}
											</span>
											{running ? (
												<button
													type="button"
													className="omp-send stop"
													onClick={cancel}
													title="停止当前任务"
												>
													<Icon name="stop" size={13} />
													<span className="omp-btn-label">停止</span>
												</button>
											) : (
												<button
													type="button"
													className="omp-send"
													onClick={() => void send()}
													disabled={!connected || !input.trim()}
													title="发送"
												>
													<Icon name="send" size={13} />
													<span className="omp-btn-label">发送</span>
												</button>
											)}
										</div>
									</div>
									{modelMenuOpen && (
										<div className="omp-model-panel" role="dialog" aria-label="模型设置">
											<div className="omp-model-list">
												<div className="omp-model-list-body">
													{(modelOption?.options || []).map((item) => {
														const active = item.value === modelOption?.currentValue;
														const context = modelContexts[item.value];
														return (
															<button
																key={item.value}
																type="button"
																className={`omp-model-option ${active ? "active" : ""}`}
																title={item.name}
																onClick={() => {
																	if (modelOption)
																		void changeConfigOption(modelOption.id, item.value);
																}}
															>
																<span className="omp-model-option-name">{item.name}</span>
																{context !== undefined && (
																	<span className="omp-model-option-ctx">
																		{formatContext(context)}
																	</span>
																)}
																{active && <Icon name="check" size={14} />}
															</button>
														);
													})}
													{!modelOption?.options?.length && (
														<div className="omp-model-empty">当前 omp 未提供可切换的模型</div>
													)}
												</div>
												<button
													type="button"
													className="omp-model-config"
													onClick={() => {
														setModelMenuOpen(false);
														setShowSettings(true);
													}}
												>
													<Icon name="settings" size={13} /> 配置自定义模型
												</button>
											</div>

											<div className="omp-model-detail">
												<div className="omp-model-detail-head">
													<strong title={currentModelName}>{currentModelName || "模型"}</strong>
													{modelOption?.currentValue && <span>{modelOption.currentValue}</span>}
												</div>
												<div className="omp-model-detail-rows">
													{activeRow ? (
														<div className="omp-model-drill">
															<button
																type="button"
																className="omp-model-drill-head"
																onClick={() => setOpenModelRow(null)}
															>
																<Icon name="chevron-right" size={12} />
																<span>{activeRow.label}</span>
															</button>
															<div className="omp-model-drill-body">
																{activeRow.options?.map((option) => (
																	<button
																		key={option.value}
																		type="button"
																		className={`omp-model-sub ${option.value === activeRow.currentValue ? "active" : ""}`}
																		onClick={() => {
																			activeRow.onSelect?.(option.value);
																			setOpenModelRow(null);
																		}}
																	>
																		<span>{option.label}</span>
																		{option.value === activeRow.currentValue && (
																			<Icon name="check" size={13} />
																		)}
																	</button>
																))}
															</div>
														</div>
													) : (
														<>
															{modelRows.map((row) => (
																<div className="omp-model-row" key={row.id}>
																	<button
																		type="button"
																		className="omp-model-row-btn"
																		onClick={() => {
																			if (row.options?.length) {
																				setOpenModelRow(row.id);
																				return;
																			}
																			row.onSelect?.("");
																		}}
																	>
																		<span className="omp-model-row-label">{row.label}</span>
																		<span className="omp-model-row-value">
																			{row.valueLabel}
																			{row.options?.length ? (
																				<Icon name="chevron-right" size={12} />
																			) : null}
																		</span>
																	</button>
																</div>
															))}
															{currentContext !== undefined && (
																<div className="omp-model-row static">
																	<span className="omp-model-row-label">上下文窗口</span>
																	<span className="omp-model-row-value">
																		{formatContext(currentContext)}
																	</span>
																</div>
															)}
															{modelRows.length === 0 && currentContext === undefined && (
																<div className="omp-model-empty">当前模型没有可调配置。</div>
															)}
														</>
													)}
												</div>
											</div>
										</div>
									)}
								</div>
								<div className="omp-disclaimer">内容由 AI 生成，请核对重要信息</div>
							</div>
						</section>

						{showPreview && (
							<aside className="omp-preview">
								<div className="omp-preview-head">
									<div>
										<Icon name="file" size={14} />
										<span>文件预览</span>
										{currentDoc && (
											<span
												className="omp-preview-current"
												title={currentDoc.path || currentDoc.name}
											>
												· {currentDoc.name}
											</span>
										)}
									</div>
									<div className="omp-preview-actions">
										<button
											type="button"
											className="omp-icon-button"
											onClick={openLocalFile}
											title="打开文件"
											aria-label="打开文件"
										>
											<Icon name="folder" size={14} />
										</button>
										{currentDoc?.path && (
											<button
												type="button"
												className="omp-icon-button"
												onClick={reloadDoc}
												title="重新读取文件"
												aria-label="重新读取文件"
											>
												<Icon name="refresh" size={14} />
											</button>
										)}
										<button
											type="button"
											className="omp-icon-button"
											onClick={() => setShowPreview(false)}
											title="关闭预览"
											aria-label="关闭预览"
										>
											<Icon name="close" size={14} />
										</button>
									</div>
								</div>
								<div className="omp-file-tabs">
									{docs.map((doc) => (
										<div
											key={doc.key}
											className={`omp-file-tab ${activeDoc === doc.key ? "active" : ""}`}
										>
											<button
												type="button"
												onClick={() => setActiveDoc(doc.key)}
												title={doc.path || doc.name}
											>
												<Icon name="file" size={12} />
												<span>{doc.name}</span>
											</button>
											<button
												type="button"
												className="omp-tab-close"
												onClick={() => closeDoc(doc.key)}
												title="关闭"
												aria-label={`关闭 ${doc.name}`}
											>
												<Icon name="close" size={11} />
											</button>
										</div>
									))}
								</div>
								<div className="omp-preview-body">
									{currentDoc ? (
										<CodeBlock code={currentDoc.content} lang={currentDoc.language} />
									) : (
										<div className="omp-preview-empty">
											<Icon name="file" size={24} />
											<p>暂无预览文件</p>
											<span>打开文件，或在回复中打开代码块</span>
											<button type="button" className="omp-preview-open" onClick={openLocalFile}>
												<Icon name="folder" size={13} />
												选择文件
											</button>
										</div>
									)}
								</div>
							</aside>
						)}
					</div>
				</main>
			</div>

			{permission && (
				<div className="omp-modal-layer" role="dialog" aria-modal="true" aria-label="权限确认">
					<div className="omp-modal">
						<div className="omp-modal-icon warning">
							<Icon name="warning" size={18} />
						</div>
						<h3>需要你的确认</h3>
						<p>omp 请求执行以下操作，请确认是否允许。</p>
						<div className="omp-permission-title">{permission.title}</div>
						<div className="omp-modal-actions">
							{permission.options.map((option) => (
								<button
									key={option.optionId}
									type="button"
									className={/reject|deny|cancel/i.test(option.kind) ? "secondary" : "primary"}
									onClick={() => {
										permission.respond({
											outcome: { outcome: "selected", optionId: option.optionId },
										});
										setPermission(null);
									}}
								>
									{option.name}
								</button>
							))}
						</div>
					</div>
				</div>
			)}

			{showSettings && (
				<div className="omp-modal-layer" role="dialog" aria-modal="true" aria-label="设置">
					<div className="omp-modal settings">
						<div className="omp-modal-icon">
							<Icon name="settings" size={18} />
						</div>
						<h3>设置</h3>
						<p>修改后会在下次启动会话时生效，主题会立即应用。</p>
						<label>
							<span>omp CLI 路径</span>
							<input
								value={settings.ompCliPath}
								onChange={(event) => setSettings({ ...settings, ompCliPath: event.target.value })}
							/>
						</label>
						<label>
							<span>bun 路径</span>
							<input
								value={settings.bunPath}
								onChange={(event) => setSettings({ ...settings, bunPath: event.target.value })}
							/>
						</label>
						<label>
							<span>工作目录</span>
							<input
								value={settings.cwd}
								onChange={(event) => setSettings({ ...settings, cwd: event.target.value })}
							/>
						</label>
						<div className="omp-settings-theme">
							<span>主题</span>
							<div className="omp-theme-switch" role="group" aria-label="主题模式">
								{(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
									<button
										key={mode}
										type="button"
										className={settings.theme === mode ? "active" : ""}
										onClick={() => setSettings({ ...settings, theme: mode })}
									>
										{THEME_LABEL[mode]}
									</button>
								))}
							</div>
						</div>
						<div className="omp-modal-actions">
							<button type="button" className="secondary" onClick={() => setShowSettings(false)}>
								取消
							</button>
							<button type="button" className="primary" onClick={saveSettings}>
								保存
							</button>
						</div>
					</div>
				</div>
			)}

			{showSkills && (
				<SkillsPanel
					cwd={settings.cwd}
					onClose={() => setShowSkills(false)}
					onUseSkill={(name) => {
						applySkill(name);
						setShowSkills(false);
					}}
				/>
			)}

			{stderrLog.length > 0 && (
				<details className="omp-logs">
					<summary>
						<Icon name="warning" size={12} /> omp 日志（{stderrLog.length}）
					</summary>
					<pre>{stderrLog.join("")}</pre>
				</details>
			)}
		</div>
	);
}
