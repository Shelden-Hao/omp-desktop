/**
 * 消息内容块：思考过程、工具调用卡片、代码/文本。
 * 工具卡片默认折叠，展开才显示输入与结果。
 */

import type { ContentBlock } from "../../../shared/types";
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
