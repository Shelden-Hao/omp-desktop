/**
 * 消息内容块：思考过程、工具调用卡片、代码/文本。
 * 思考与工具卡片默认展开（和终端保持一致），用户可自行折叠；工具卡片展示输入、输出与文件 diff。
 */

import { Fragment, useEffect, useRef, useState } from "react";
import type { ContentBlock, ToolDiff } from "../../../shared/types";
import { diffHunks, diffStats } from "../../core/diff";
import { TOOL_KIND_LABEL } from "../../core/labels";
import { Icon, type IconName } from "../common/Icon";
import { CodeBlock } from "./CodeBlock";
import { Markdown } from "./Markdown";

const TOOL_STATUS: Record<string, { label: string; icon: IconName }> = {
	pending: { label: "执行中", icon: "spark" },
	completed: { label: "已完成", icon: "check" },
	failed: { label: "失败", icon: "warning" },
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

export function Block({
	block,
	onOpenDoc,
	query = "",
}: {
	block: ContentBlock;
	onOpenDoc: (name: string, content: string, path?: string) => void;
	query?: string;
}) {
	if (block.type === "thinking") {
		return <ThinkingBlock block={block} onOpenDoc={onOpenDoc} query={query} />;
	}

	if (block.type === "tool_call") {
		return <ToolCard block={block} />;
	}

	if (block.type === "tool_result" || block.type === "diff" || block.type === "other") {
		return <CodeBlock code={block.text} />;
	}

	return <Markdown text={block.text} onOpen={onOpenDoc} query={query} />;
}

function ThinkingBlock({
	block,
	onOpenDoc,
	query,
}: {
	block: ContentBlock;
	onOpenDoc: (name: string, content: string, path?: string) => void;
	query: string;
}) {
	const [open, setOpen] = useState(true);
	const bodyRef = useRef<HTMLDivElement>(null);

	// 流式追加时跟到最新内容；折叠状态下不滚，用户手动往上翻也保持位置
	useEffect(() => {
		const body = bodyRef.current;
		if (body?.closest("details")?.open) body.scrollTop = body.scrollHeight;
	}, [block.text]);

	return (
		<details
			className="omp-thinking"
			open={open}
			onToggle={(event) => setOpen(event.currentTarget.open)}
		>
			<summary>
				<Icon name="spark" size={14} />
				<span>思考过程</span>
				<span className="omp-thinking-count">{block.text.length} 字</span>
				<Icon name="chevron" size={12} className="omp-fold-chevron" />
			</summary>
			<div className="omp-thinking-body" ref={bodyRef}>
				<Markdown text={block.text} onOpen={onOpenDoc} query={query} />
			</div>
		</details>
	);
}

function ToolCard({ block }: { block: ContentBlock }) {
	const [open, setOpen] = useState(true);
	const status = TOOL_STATUS[block.status || "pending"];
	const label = toolLabel(block);
	const raw = block.raw as Record<string, unknown> | undefined;
	const legacyTitle = typeof raw?.title === "string" ? raw.title : "";
	const title = block.title || legacyTitle;
	const diffs = block.diffs ?? [];
	const locations = (block.locations ?? []).filter(
		(path) => !diffs.some((diff) => diff.path === path),
	);
	const input = block.rawInput || "";
	const hasDetail = Boolean(input || block.result || diffs.length || locations.length);

	return (
		<details
			className={`omp-tool-card ${block.status || "pending"}`}
			open={open}
			onToggle={(event) => setOpen(event.currentTarget.open)}
		>
			<summary className="omp-tool-summary">
				<span className="omp-tool-icon">
					<Icon name={status.icon} size={14} />
				</span>
				<span className="omp-tool-label">{label}</span>
				{title && <span className="omp-tool-title-inline">{title}</span>}
				<span className="omp-tool-status">{status.label}</span>
				<Icon name="chevron" size={12} className="omp-fold-chevron" />
			</summary>
			{hasDetail && (
				<div className="omp-tool-body">
					{locations.length > 0 && (
						<div className="omp-tool-files">
							{locations.map((path) => (
								<span key={path} className="omp-tool-file">
									<Icon name="file" size={11} />
									{path}
								</span>
							))}
						</div>
					)}
					{input && !diffs.length && (
						<div className="omp-tool-section">
							<div className="omp-tool-section-label">输入</div>
							<pre className="omp-tool-pre">{input}</pre>
						</div>
					)}
					{diffs.map((diff) => (
						<ToolDiffView key={diff.path} diff={diff} />
					))}
					{block.result && (
						<div className="omp-tool-section">
							<div className="omp-tool-section-label">结果</div>
							<pre className="omp-tool-pre">{block.result}</pre>
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
		<div className="omp-tool-diff">
			<div className="omp-tool-diff-head">
				<Icon name="file" size={12} />
				<span className="omp-tool-diff-path">{diff.path}</span>
				<span className="omp-tool-diff-stat add">+{stats.added}</span>
				<span className="omp-tool-diff-stat del">−{stats.removed}</span>
			</div>
			<pre className="omp-tool-diff-pre">
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

/** 底部圆环：外层是上下文窗口，内层弧线是已用比例 */
