/**
 * 消息内容块：思考过程、工具调用、代码/文本。
 * 折叠规则由上层传入的 `live` 决定：执行中展开（看得到 Agent 在做什么），这一轮结束后折叠。
 * 思考与工具步骤共用 `.omp-step` 时间线样式，工具步骤展示输入、输出与文件 diff。
 */

import { Fragment, useLayoutEffect, useRef } from "react";
import type { ContentBlock, ToolDiff } from "../../../shared/types";
import { diffHunks, diffStats } from "../../core/diff";
import { shortPath } from "../../core/format";
import { TOOL_KIND_LABEL } from "../../core/labels";
import { useAutoOpen } from "../../hooks/use-auto-open";
import { Icon, type IconName } from "../common/Icon";
import { CodeBlock } from "./CodeBlock";
import { Markdown } from "./Markdown";

/** 工具类别 → 步骤图标；颜色只表达状态，图标表达动作 */
const TOOL_ICON: Record<string, IconName> = {
	execute: "terminal",
	read: "file",
	edit: "pencil",
	delete: "trash",
	move: "folder",
	search: "search",
	fetch: "link",
	think: "spark",
	switch_mode: "rotate",
	other: "layers",
};

/** 工具名比 ACP 的 kind 更细：write 和 edit 都是 edit，但做的是两件事 */
function describeTool(block: ContentBlock): { label: string; icon: IconName } {
	const name = (block.toolName || "").toLowerCase();
	if (/write|create/.test(name)) return { label: "写入文件", icon: "file" };
	if (/edit|patch|apply/.test(name)) return { label: "编辑文件", icon: "pencil" };
	if (/read|cat/.test(name)) return { label: "读取文件", icon: "file" };
	if (/grep|glob|search|find/.test(name)) return { label: "搜索", icon: "search" };
	if (/bash|shell|exec|command|terminal/.test(name)) return { label: "运行命令", icon: "terminal" };
	if (/fetch|web|http/.test(name)) return { label: "获取内容", icon: "link" };
	if (/delete|remove/.test(name)) return { label: "删除文件", icon: "trash" };
	if (/move|rename/.test(name)) return { label: "移动文件", icon: "folder" };
	if (block.kind && TOOL_KIND_LABEL[block.kind]) {
		return { label: TOOL_KIND_LABEL[block.kind], icon: TOOL_ICON[block.kind] ?? "layers" };
	}
	return { label: block.toolName || "工具调用", icon: "layers" };
}

/** 标题里的绝对路径折成末两段，避免一行全被 C:/Users/... 占满 */
function compactTitle(title: string): string {
	return title.replace(/[A-Za-z]:[\\/][^\s"'`;,)）]+/g, (match) => shortPath(match));
}

/** 太长时保留头尾、丢掉中段：命令尾部（管道、参数）通常才是关键 */
function clampMiddle(text: string, limit = 64): string {
	if (text.length <= limit) return text;
	const head = Math.ceil((limit - 1) * 0.6);
	return `${text.slice(0, head)}…${text.slice(-(limit - 1 - head))}`;
}

/** 只是执行上下文、不构成「这次调用的内容」的键 */
const META_KEYS: Record<string, true> = {
	i: true,
	name: true,
	cwd: true,
	timeout: true,
	pty: true,
	ready: true,
	description: true,
};

/** 输入里的有效字符串都已在标题里出现时，这块输入就是重复信息 */
function inputCoveredByTitle(input: string, title: string): boolean {
	if (!title) return false;
	let parsed: unknown;
	try {
		parsed = JSON.parse(input);
	} catch {
		return input === title;
	}
	const strings: string[] = [];
	const walk = (value: unknown) => {
		if (typeof value === "string") {
			if (value.trim() && value !== "true" && value !== "false") strings.push(value);
			return;
		}
		if (Array.isArray(value)) {
			value.forEach(walk);
			return;
		}
		if (value && typeof value === "object") {
			for (const [key, child] of Object.entries(value)) {
				if (!META_KEYS[key]) walk(child);
			}
		}
	};
	walk(parsed);
	return strings.length > 0 && strings.every((value) => title.includes(value));
}

/** 折叠时展示的第一行思考，展开后由 CSS 隐藏 */
function thinkingPreview(text: string): string {
	const firstLine = text.trim().split("\n")[0]?.trim() ?? "";
	return firstLine.length > 72 ? `${firstLine.slice(0, 72)}…` : firstLine;
}

export function Block({
	block,
	onOpenDoc,
	query = "",
	live = false,
}: {
	block: ContentBlock;
	onOpenDoc: (name: string, content: string, path?: string) => void;
	query?: string;
	/** 该轮是否仍在执行：执行中过程默认展开，结束后默认折叠 */
	live?: boolean;
}) {
	if (block.type === "thinking") {
		return <ThinkingStep block={block} onOpenDoc={onOpenDoc} query={query} live={live} />;
	}

	if (block.type === "tool_call") {
		return <ToolStep block={block} live={live} />;
	}

	if (block.type === "tool_result" || block.type === "diff" || block.type === "other") {
		return <CodeBlock code={block.text} />;
	}

	return <Markdown text={block.text} onOpen={onOpenDoc} query={query} />;
}

function ThinkingStep({
	block,
	onOpenDoc,
	query,
	live,
}: {
	block: ContentBlock;
	onOpenDoc: (name: string, content: string, path?: string) => void;
	query: string;
	live: boolean;
}) {
	const { open, onToggle } = useAutoOpen(live);
	const bodyRef = useRef<HTMLDivElement>(null);

	// 每帧渲染后贴到最新内容；折叠状态下不滚，用户手动往上翻也保持位置
	useLayoutEffect(() => {
		const body = bodyRef.current;
		if (body?.closest("details")?.open) body.scrollTop = body.scrollHeight;
	});

	return (
		<details className="omp-step" open={open} onToggle={onToggle}>
			<summary className="omp-step-head">
				<span className="omp-step-icon thinking">
					<Icon name="spark" size={11} />
				</span>
				<span className="omp-step-name">思考</span>
				<span className="omp-step-preview">{thinkingPreview(block.text)}</span>
				<Icon name="chevron" size={12} className="omp-fold-chevron" />
			</summary>
			<div className="omp-step-body" ref={bodyRef}>
				<Markdown text={block.text} onOpen={onOpenDoc} query={query} />
			</div>
		</details>
	);
}

function ToolStep({ block, live }: { block: ContentBlock; live: boolean }) {
	// 失败的工具调用结束后也保持展开：错误本身就是结论的一部分
	const status = block.status || "pending";
	const { open, onToggle } = useAutoOpen(live || status === "failed");
	const { label, icon } = describeTool(block);
	const raw = block.raw as Record<string, unknown> | undefined;
	const legacyTitle = typeof raw?.title === "string" ? raw.title : "";
	const title = compactTitle(block.title || legacyTitle);
	const subject = clampMiddle(title);
	const diffs = block.diffs ?? [];
	// 文件类步骤的路径已经在标题里；位置 chip 只留给搜索/抓取这类「命中多个文件」的动作
	const showLocations = block.kind === "search" || block.kind === "fetch";
	const locations = showLocations ? (block.locations ?? []) : [];
	const input = block.rawInput || "";
	const showInput = Boolean(input) && !diffs.length && !inputCoveredByTitle(input, title);
	const hasDetail = Boolean(showInput || block.result || diffs.length || locations.length);

	return (
		<details className={`omp-step ${status}`} open={open} onToggle={onToggle}>
			<summary className="omp-step-head">
				<span className={`omp-step-icon ${status}`}>
					<Icon name={icon} size={11} />
				</span>
				<span className="omp-step-name">{label}</span>
				{title && (
					<span className="omp-step-subject" title={block.title || legacyTitle}>
						{subject}
					</span>
				)}
				{status !== "completed" && (
					<span className={`omp-step-status ${status}`}>
						{status === "failed" ? "失败" : "执行中"}
					</span>
				)}
				<Icon name="chevron" size={12} className="omp-fold-chevron" />
			</summary>
			{hasDetail && (
				<div className="omp-step-body">
					{locations.length > 0 && (
						<div className="omp-step-files">
							{locations.map((path) => (
								<span key={path} className="omp-step-file">
									{path}
								</span>
							))}
						</div>
					)}
					{showInput && (
						<div className="omp-io">
							<span className="omp-io-label">输入</span>
							<pre className="omp-io-pre">{input}</pre>
						</div>
					)}
					{diffs.map((diff) => (
						<ToolDiffView key={diff.path} diff={diff} />
					))}
					{block.result && (
						<div className="omp-io">
							<span className={`omp-io-label ${status === "failed" ? "error" : ""}`}>
								{status === "failed" ? "错误" : "结果"}
							</span>
							<pre className={`omp-io-pre ${status === "failed" ? "error" : ""}`}>
								{block.result}
							</pre>
						</div>
					)}
				</div>
			)}
		</details>
	);
}

const DIFF_PREFIX = { add: "+", del: "−", context: " " } as const;

function ToolDiffView({ diff }: { diff: ToolDiff }) {
	const hunks = diffHunks(diff.oldText, diff.newText);
	const stats = diffStats(hunks.flatMap((hunk) => hunk.lines));

	return (
		<div className="omp-diff">
			<div className="omp-diff-head">
				<span className="omp-diff-path">{diff.path}</span>
				<span className="omp-diff-stats">
					<em className="add">+{stats.added}</em>
					<em className="del">−{stats.removed}</em>
				</span>
			</div>
			<pre className="omp-diff-pre">
				{hunks.map((hunk, hunkIndex) => (
					<Fragment key={hunkIndex}>
						{hunk.skipped > 0 && (
							<span className="omp-diff-skip">{`⋯ ${hunk.skipped} 行未改动`}</span>
						)}
						{hunk.lines.map((line, lineIndex) => (
							<span key={lineIndex} className={`omp-diff-line ${line.kind}`}>
								{DIFF_PREFIX[line.kind]}
								{line.text}
							</span>
						))}
					</Fragment>
				))}
			</pre>
		</div>
	);
}
