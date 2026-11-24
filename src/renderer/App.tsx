import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	AcpClient,
	type AcpEvent,
	type ChatMessage,
	type ContentBlock,
	type DesktopSettings,
	type ThemeMode,
	type SessionState,
	normalizeSessionState,
} from "./acp-client";
import { DEFAULT_DOCS, type DocFile } from "./docs";

interface Session {
	id: string;
	title: string;
	cwd?: string;
	ts?: number;
}

type SidebarView = "recent" | "grouped";

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
	| "rotate";

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

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
	const common = {
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
		case "close":
			return (
				<svg {...common}>
					<path d="M6 6l12 12M18 6 6 18" />
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
				part.hit ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
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
					<Icon name="spark" size={13} /> 思考过程
				</summary>
				<div className="omp-thinking-body">
					<Markdown text={block.text} onOpen={onOpenDoc} query={query} />
				</div>
			</details>
		);
	}

	if (block.type === "tool_call") {
		const status = TOOL_STATUS[block.status || "pending"];
		const raw = block.raw as Record<string, unknown> | undefined;
		const title = typeof raw?.title === "string" ? raw.title : "";
		const hasResult =
			block.status !== "pending" && block.text !== raw?.toolCallId && block.text.length > 0;
		return (
			<div className={`omp-tool-card ${block.status || "pending"}`}>
				<div className="omp-tool-main">
					<span className="omp-tool-icon">
						<Icon name={status.icon} size={14} />
					</span>
					<div className="omp-tool-copy">
						<div className="omp-tool-title">{block.toolName}</div>
						{title && <div className="omp-tool-subtitle">{title}</div>}
					</div>
					<span className="omp-tool-status">{status.label}</span>
				</div>
				{hasResult && (
					<details className="omp-tool-result">
						<summary>查看结果</summary>
						<pre>{block.text}</pre>
					</details>
				)}
			</div>
		);
	}

	if (block.type === "tool_result" || block.type === "diff" || block.type === "other") {
		return <CodeBlock code={block.text} />;
	}

	return <Markdown text={block.text} onOpen={onOpenDoc} query={query} />;
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
	const [settings, setSettings] = useState<DesktopSettings>({
		ompCliPath: "",
		bunPath: "",
		cwd: "",
		theme: "system",
	});
	const [permission, setPermission] = useState<PermissionState | null>(null);
	const [docs, setDocs] = useState<DocFile[]>(DEFAULT_DOCS);
	const [activeDoc, setActiveDoc] = useState<string | null>(null);
	const [showPreview, setShowPreview] = useState(true);
	const [sidebarView, setSidebarView] = useState<SidebarView>("recent");
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchText, setSearchText] = useState("");
	const [sessionStates, setSessionStates] = useState<Record<string, SessionState>>({});
	const [modelMenuOpen, setModelMenuOpen] = useState(false);

	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const toolIndex = useRef<Map<string, number>>(new Map());
	const activeIdRef = useRef<string | null>(null);
	const loadedSessions = useRef<Set<string>>(new Set());
	const pendingPermissionRef = useRef<PermissionState | null>(null);
	const cancelledSessionRef = useRef<string | null>(null);

	const messages = activeId ? messagesBySession[activeId] || [] : [];
	const visibleMessages = searchText.trim()
		? messages.filter((message) =>
				message.blocks.some((block) =>
					block.text.toLowerCase().includes(searchText.trim().toLowerCase()),
				),
			)
		: messages;
	const currentDoc = docs.find((doc) => doc.key === activeDoc);

	useEffect(() => {
		activeIdRef.current = activeId;
	}, [activeId]);

	useEffect(() => {
		pendingPermissionRef.current = permission;
	}, [permission]);

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

	useEffect(() => {
		const el = inputRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
	}, [input]);

	const updateMessages = useCallback(
		(sessionId: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
			setMessagesBySession((prev) => ({ ...prev, [sessionId]: updater(prev[sessionId] || []) }));
		},
		[],
	);

	const appendBlock = useCallback(
		(sessionId: string, block: ContentBlock, toolCallId?: string) => {
			updateMessages(sessionId, (prev) => {
				const last = prev[prev.length - 1];
				if (last?.role === "agent" && !toolCallId) {
					const copy = [...prev];
					copy[copy.length - 1] = { ...last, blocks: [...last.blocks, block] };
					return copy;
				}
				const message: ChatMessage = { id: uid(), role: "agent", blocks: [block], ts: Date.now() };
				if (toolCallId) toolIndex.current.set(`${sessionId}:${toolCallId}`, prev.length);
				return [...prev, message];
			});
		},
		[updateMessages],
	);

	const updateToolStatus = useCallback(
		(sessionId: string, toolCallId: string, next: "completed" | "failed", result?: string) => {
			const index = toolIndex.current.get(`${sessionId}:${toolCallId}`);
			if (index === undefined) return;
			updateMessages(sessionId, (prev) => {
				const copy = [...prev];
				const message = copy[index];
				if (!message) return prev;
				copy[index] = {
					...message,
					blocks: message.blocks.map((block) =>
						block.toolName && block.text === toolCallId
							? { ...block, status: next, text: result || block.text }
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

				const content = update.content as { text?: string } | undefined;

				if (kind === "agent_message_chunk" && content?.text) {
					appendBlock(sessionId, { type: "text", text: content.text });
				} else if (kind === "agent_thought_chunk" && content?.text) {
					appendBlock(sessionId, { type: "thinking", text: content.text });
				} else if (kind === "tool_call") {
					const toolCallId = update.toolCallId as string;
					appendBlock(
						sessionId,
						{
							type: "tool_call",
							text: toolCallId,
							toolName: (update.title as string) || (update.kind as string) || "tool",
							status: "pending",
							raw: update,
						},
						toolCallId,
					);
				} else if (kind === "tool_call_update") {
					const toolCallId = update.toolCallId as string;
					const next = update.status as string;
					if (next === "completed" || next === "failed") {
						const result = (update.content as { text?: string } | undefined)?.text;
						updateToolStatus(
							sessionId,
							toolCallId,
							next === "completed" ? "completed" : "failed",
							result,
						);
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
		[appendBlock, updateToolStatus],
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
		setClient(acp);

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
				const first = list[0];
				setActiveId(first.id);
				setConnected(true);
				setStatus("已连接");
				await loadSessionHistory(acp, first.id, first.cwd || loaded.cwd);
			} catch (error) {
				setStatus(`握手失败：${(error as Error).message}`);
			}
		})();

		return () => acp.stop();
	}, [handleEvent, loadSessionHistory, persistSessions]);

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
	}, [messages.length, permission, running]);

	const send = async (override?: string) => {
		const text = (override ?? input).trim();
		if (!client || !activeId || !text || running) return;
		const sessionId = activeId;
		const startedAt = Date.now();
		const userMessageId = uid();
		setInput("");
		updateMessages(sessionId, (prev) => [
			...prev,
			{ id: userMessageId, role: "user", blocks: [{ type: "text", text }], ts: startedAt },
		]);
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
			updateMessages(sessionId, (prev) =>
				prev.map((item) =>
					item.id === userMessageId ? { ...item, durationMs: Date.now() - startedAt } : item,
				),
			);
			setRunning(false);
			inputRef.current?.focus();
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
		setRunning(false);
	};

	const selectSession = async (session: Session) => {
		setActiveId(session.id);
		setRunning(false);
		if (client && !loadedSessions.current.has(session.id)) {
			const loaded = await window.desktop.settings.get();
			await loadSessionHistory(client, session.id, session.cwd || loaded.cwd);
		}
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

	const changeTheme = async (theme: ThemeMode) => {
		const next = { ...settings, theme };
		setSettings(next);
		try {
			await window.desktop.settings.set({ theme });
		} catch (error) {
			setStatus(`主题保存失败：${(error as Error).message}`);
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
			const reference = file.path.includes(" ") ? `@"${file.path}"` : `@${file.path}`;
			setInput((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${reference} `);
			inputRef.current?.focus();
		} catch (error) {
			setStatus(`引用文件失败：${(error as Error).message}`);
		}
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
			(option) => option.id !== modelOption?.id && option.id !== thoughtOption?.id,
		) || [];
	const currentModeName = activeState?.modes?.availableModes.find(
		(mode) => mode.id === activeState.modes?.currentModeId,
	)?.name;
	const currentModelName =
		modelOption?.options?.find((item) => item.value === modelOption.currentValue)?.name ||
		modelOption?.currentValue;

	return (
		<div className="omp-app">
			<header className="omp-titlebar">
				<div className="omp-titlebar-left">
					<span className="omp-logo">
						<Icon name="spark" size={15} />
					</span>
					<span className="omp-product">OMP Desktop</span>
					<span className="omp-title-divider" />
					<span className="omp-tagline">Coding Agent Shell</span>
				</div>
				<div className="omp-titlebar-right">
					<span className={`omp-connection ${connected ? "online" : "offline"}`} title={status}>
						<span className="omp-connection-dot" />
						{connected ? "已连接" : "未连接"}
					</span>
					<div className="omp-theme-switch" role="group" aria-label="主题模式">
						{(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
							<button
								key={mode}
								type="button"
								className={settings.theme === mode ? "active" : ""}
								onClick={() => changeTheme(mode)}
								title={THEME_LABEL[mode]}
								aria-label={THEME_LABEL[mode]}
							>
								<Icon
									name={mode === "light" ? "sun" : mode === "dark" ? "moon" : "monitor"}
									size={14}
								/>
							</button>
						))}
					</div>
					<button
						type="button"
						className="omp-icon-button"
						onClick={() => setShowSettings(true)}
						title="设置"
						aria-label="设置"
					>
						<Icon name="settings" size={15} />
					</button>
				</div>
			</header>

			<div className="omp-workspace">
				<aside className="omp-sidebar">
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
							onClick={() => setShowSettings(true)}
							title="MCP 与扩展在设置中配置"
						>
							<Icon name="layers" size={16} />
							<span>技能与连接器</span>
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
								{sessions.length === 0 && <div className="omp-list-empty">还没有会话</div>}
								{sessions.map((session) => (
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
								{Object.entries(
									sessions.reduce<Record<string, Session[]>>((groups, session) => {
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
					<div className="omp-topbar">
						<strong className="omp-topbar-title" title={activeTitle}>
							{activeTitle}
						</strong>
						<div className="omp-topbar-actions">
							<span className="omp-topbar-status" title={status}>
								{status}
							</span>
							<button
								type="button"
								className={`omp-icon-button ${searchOpen ? "active" : ""}`}
								onClick={() => {
									setSearchOpen((value) => !value);
									if (searchOpen) setSearchText("");
								}}
								title="搜索当前会话"
								aria-label="搜索当前会话"
							>
								<Icon name="search" size={15} />
							</button>
							<button
								type="button"
								className={`omp-icon-button ${showPreview ? "active" : ""}`}
								onClick={() => setShowPreview((value) => !value)}
								title={showPreview ? "隐藏文件预览" : "显示文件预览"}
								aria-label="切换文件预览"
							>
								<Icon name="panel" size={15} />
							</button>
						</div>
					</div>
					{searchOpen && (
						<div className="omp-searchbar">
							<Icon name="search" size={14} />
							<input
								autoFocus
								value={searchText}
								onChange={(event) => setSearchText(event.target.value)}
								placeholder="在当前会话中搜索…"
								aria-label="搜索当前会话消息"
							/>
							{searchText && (
								<span className="omp-search-count">
									{
										messages.filter((m) =>
											m.blocks.some((b) => b.text.toLowerCase().includes(searchText.toLowerCase())),
										).length
									}{" "}
									条结果
								</span>
							)}
							<button
								type="button"
								className="omp-icon-button"
								onClick={() => {
									setSearchOpen(false);
									setSearchText("");
								}}
								title="关闭搜索"
								aria-label="关闭搜索"
							>
								<Icon name="close" size={14} />
							</button>
						</div>
					)}

					<div className="omp-content">
						<section className="omp-chat">
							<div className="omp-messages" ref={scrollRef}>
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
														setInput(hint);
														inputRef.current?.focus();
													}}
												>
													{hint}
													<Icon name="chevron-right" size={12} />
												</button>
											))}
										</div>
									</div>
								)}

								{visibleMessages.map((message) => (
									<article key={message.id} className={`omp-message ${message.role}`}>
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
											<div className="omp-message-content">
												{message.blocks.map((block, index) => (
													<Block
														key={index}
														block={block}
														onOpenDoc={openDoc}
														query={searchText.trim()}
													/>
												))}
											</div>
											<MessageActions
												text={message.blocks.map((block) => block.text).join("\n")}
												onRetry={message.role === "user" ? () => retryMessage(message) : undefined}
											/>
										</div>
									</article>
								))}

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

							<div className="omp-composer-wrap">
								<div className="omp-composer">
									<textarea
										ref={inputRef}
										value={input}
										onChange={(event) => setInput(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter" && !event.shiftKey) {
												event.preventDefault();
												send();
											}
										}}
										placeholder={connected ? "描述任务，按 Enter 发送" : "等待连接 omp…"}
										disabled={!connected || running}
										aria-label="任务输入框"
									/>
									<div className="omp-composer-footer">
										<div className="omp-composer-hint">
											<button
												type="button"
												className="omp-reference"
												onClick={insertFileReference}
												title="选择文件并插入引用"
											>
												<Icon name="folder" size={13} />
												引用文件
											</button>
											{currentModeName && (
												<span className="omp-hint-tag" title="推理档位">
													{currentModeName}
												</span>
											)}
											<span title={settings.cwd}>{shortPath(settings.cwd)}</span>
										</div>
										<div className="omp-composer-tools">
											<button
												type="button"
												className={`omp-model-trigger ${modelMenuOpen ? "active" : ""}`}
												onClick={() => setModelMenuOpen((value) => !value)}
												title="模型与推理档位"
												aria-label="模型与推理档位"
											>
												<Icon name="spark" size={13} />
												<span>{currentModelName || "模型"}</span>
												<Icon name="chevron" size={12} />
											</button>
											{running ? (
												<button
													type="button"
													className="omp-send stop"
													onClick={cancel}
													title="停止当前任务"
												>
													<Icon name="stop" size={13} /> 停止
												</button>
											) : (
												<button
													type="button"
													className="omp-send"
													onClick={send}
													disabled={!connected || !input.trim()}
													title="发送"
												>
													<Icon name="send" size={13} /> 发送
												</button>
											)}
										</div>
									</div>
									{modelMenuOpen && (
										<div className="omp-model-menu">
											<div className="omp-model-menu-head">
												<span>
													<Icon name="spark" size={14} /> 模型与推理档位
												</span>
												<button
													type="button"
													className="omp-icon-button"
													onClick={() => setModelMenuOpen(false)}
													title="关闭"
													aria-label="关闭"
												>
													<Icon name="close" size={13} />
												</button>
											</div>
											<div className="omp-model-menu-body">
												{activeState?.modes && activeState.modes.availableModes.length > 0 && (
													<div className="omp-model-section">
														<div className="omp-model-section-title">推理档位</div>
														{activeState.modes.availableModes.map((mode) => (
															<button
																key={mode.id}
																type="button"
																className={`omp-model-item ${mode.id === activeState.modes?.currentModeId ? "active" : ""}`}
																onClick={() => void changeMode(mode.id)}
															>
																<span>{mode.name}</span>
																{mode.description && <small>{mode.description}</small>}
																{mode.id === activeState.modes?.currentModeId && (
																	<Icon name="check" size={14} />
																)}
															</button>
														))}
													</div>
												)}
												{modelOption && modelOption.options && modelOption.options.length > 0 && (
													<div className="omp-model-section">
														<div className="omp-model-section-title">{modelOption.name}</div>
														{modelOption.options.map((item) => (
															<button
																key={item.value}
																type="button"
																className={`omp-model-item ${item.value === modelOption.currentValue ? "active" : ""}`}
																onClick={() => void changeConfigOption(modelOption.id, item.value)}
															>
																<span>{item.name}</span>
																{item.description && <small>{item.description}</small>}
																{item.value === modelOption.currentValue && (
																	<Icon name="check" size={14} />
																)}
															</button>
														))}
													</div>
												)}
												{thoughtOption &&
													thoughtOption.options &&
													thoughtOption.options.length > 0 && (
														<div className="omp-model-section">
															<div className="omp-model-section-title">{thoughtOption.name}</div>
															{thoughtOption.options.map((item) => (
																<button
																	key={item.value}
																	type="button"
																	className={`omp-model-item ${item.value === thoughtOption.currentValue ? "active" : ""}`}
																	onClick={() =>
																		void changeConfigOption(thoughtOption.id, item.value)
																	}
																>
																	<span>{item.name}</span>
																	{item.value === thoughtOption.currentValue && (
																		<Icon name="check" size={14} />
																	)}
																</button>
															))}
														</div>
													)}
												{otherSelects.map((option) => (
													<div className="omp-model-section" key={option.id}>
														<div className="omp-model-section-title">{option.name}</div>
														{option.type === "boolean" ? (
															<button
																type="button"
																className={`omp-model-item ${option.currentBoolean ? "active" : ""}`}
																onClick={() =>
																	void changeConfigOption(option.id, !option.currentBoolean)
																}
															>
																<span>{option.currentBoolean ? "已开启" : "已关闭"}</span>
															</button>
														) : (
															(option.options || []).map((item) => (
																<button
																	key={item.value}
																	type="button"
																	className={`omp-model-item ${item.value === option.currentValue ? "active" : ""}`}
																	onClick={() => void changeConfigOption(option.id, item.value)}
																>
																	<span>{item.name}</span>
																	{item.value === option.currentValue && (
																		<Icon name="check" size={14} />
																	)}
																</button>
															))
														)}
													</div>
												))}
												{!activeState?.modes?.availableModes.length &&
													!modelOption &&
													otherSelects.length === 0 && (
														<div className="omp-model-empty">
															当前 omp 未提供可切换的模型或档位。
															<br />
															可在设置中修改 omp 配置。
														</div>
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
