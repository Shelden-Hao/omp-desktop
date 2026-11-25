/**
 * 对话消息区：空状态引导、消息列表、处理过程折叠、回到底部按钮。
 *
 * 这里只做「给定消息列表怎么画」，滚动与搜索高亮由上层提供的回调驱动；
 * 消息如何归约（流式拼接、工具调用状态）在 core/acp 与 App 的状态里完成。
 */

import type { RefObject } from "react";
import type { ChatMessage } from "../../../shared/types";
import { formatDuration } from "../../core/format";
import { summarizeProcess } from "../../core/process-summary";
import { useAutoOpen } from "../../hooks/use-auto-open";
import { useElapsed } from "../../hooks/use-elapsed";
import { Icon } from "../common/Icon";
import { Block } from "./ContentBlock";
import { MessageActions } from "./MessageActions";

/** 空状态里的示例任务，点一下填进输入框 */
const HOME_HINTS = ["解释当前目录的代码结构", "帮我修复一个失败的测试", "梳理这个项目的待办事项"];

interface MessageListProps {
	messages: ChatMessage[];
	running: boolean;
	/** 搜索词，用于消息内高亮 */
	query: string;
	/** 是否已滚到底部，决定是否显示「回到底部」按钮 */
	atBottom: boolean;
	suggestionsEnabled: boolean;
	scrollRef: RefObject<HTMLDivElement | null>;
	onScroll(): void;
	onScrollToBottom(): void;
	onOpenDoc(name: string, content: string, path?: string): void;
	onRetry(message: ChatMessage): void;
	onPickHint(hint: string): void;
}

export function MessageList({
	messages,
	running,
	query,
	atBottom,
	suggestionsEnabled,
	scrollRef,
	onScroll,
	onScrollToBottom,
	onOpenDoc,
	onRetry,
	onPickHint,
}: MessageListProps) {
	return (
		<div className="omp-messages-wrap">
			<div className="omp-messages" ref={scrollRef} onScroll={onScroll}>
				{messages.length === 0 && (
					<div className="omp-empty">
						<div className="omp-empty-mark">
							<Icon name="spark" size={28} />
						</div>
						<h2>把任务交给 omp</h2>
						<p>它会在当前工作目录中读取文件、执行命令，并把过程展现在这里。</p>
						<div className="omp-empty-hints">
							{suggestionsEnabled &&
								HOME_HINTS.map((hint) => (
									<button key={hint} type="button" onClick={() => onPickHint(hint)}>
										{hint}
										<Icon name="chevron-right" size={12} />
									</button>
								))}
						</div>
					</div>
				)}

				{messages.map((message, messageIndex) => {
					const isActive = running && messageIndex === messages.length - 1;
					return (
						<Message
							key={message.id}
							message={message}
							isActive={isActive}
							query={query}
							onOpenDoc={onOpenDoc}
							onRetry={onRetry}
						/>
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
						onClick={onScrollToBottom}
						title="回到最底部"
						aria-label="回到最底部"
					>
						<Icon name="chevron" size={16} />
					</button>
				</div>
			)}
		</div>
	);
}

interface MessageProps {
	message: ChatMessage;
	/** 是否正在流式输出的最后一条 */
	isActive: boolean;
	query: string;
	onOpenDoc(name: string, content: string, path?: string): void;
	onRetry(message: ChatMessage): void;
}

function Message({ message, isActive, query, onOpenDoc, onRetry }: MessageProps) {
	const generating = message.role === "agent" && isActive;
	// 末尾连续的 text 块是「结论」，前面的思考/工具调用收进折叠区：执行中展开，结束后折叠
	const splitAt = trailingTextStart(message.blocks);
	const processBlocks = message.blocks.slice(0, splitAt);
	const finalBlocks = message.blocks.slice(splitAt);
	const hasProcess = message.role === "agent" && processBlocks.length > 0 && finalBlocks.length > 0;

	return (
		<article className={`omp-message ${message.role}`} data-message-id={message.id}>
			<div className="omp-message-body">
				<div className="omp-message-meta">
					<span>{message.role === "user" ? "你" : message.role === "agent" ? "omp" : "系统"}</span>
					<time>
						{new Date(message.ts).toLocaleTimeString("zh-CN", {
							hour: "2-digit",
							minute: "2-digit",
						})}
					</time>
					{message.role === "user" && message.durationMs !== undefined && (
						<span className="omp-duration">
							<Icon name="check" size={11} /> 已完成 {formatDuration(message.durationMs)}
						</span>
					)}
				</div>
				{hasProcess ? (
					<ProcessFold
						blocks={processBlocks}
						generating={generating}
						startedAt={message.ts}
						durationMs={message.durationMs}
						query={query}
						onOpenDoc={onOpenDoc}
					/>
				) : (
					message.role === "agent" && (
						<div className={`omp-agent-status ${generating ? "busy" : ""}`}>
							<Icon name={generating ? "spark" : "check"} size={11} />
							<span>
								{generating ? "生成中" : "已完成"}
								{!generating && message.durationMs !== undefined
									? ` ${formatDuration(message.durationMs)}`
									: ""}
							</span>
						</div>
					)
				)}
				{message.blocks.length > 0 && (
					<div className="omp-message-content">
						{(hasProcess ? finalBlocks : message.blocks).map((block, index) => (
							<Block
								key={index}
								block={block}
								onOpenDoc={onOpenDoc}
								query={query}
								live={generating}
							/>
						))}
					</div>
				)}
				<MessageActions
					text={message.blocks.map((block) => block.text).join("\n")}
					onRetry={message.role === "user" ? () => onRetry(message) : undefined}
				/>
			</div>
		</article>
	);
}

/**
 * 一轮里的思考与工具调用：执行中展开让人看到进度，结束后自动折叠，只留最终回复。
 * 用户手动展开/收起过之后以用户为准。
 */
function ProcessFold({
	blocks,
	generating,
	startedAt,
	durationMs,
	query,
	onOpenDoc,
}: {
	blocks: ChatMessage["blocks"];
	generating: boolean;
	startedAt: number;
	durationMs?: number;
	query: string;
	onOpenDoc: (name: string, content: string, path?: string) => void;
}) {
	const { open, onToggle } = useAutoOpen(generating);
	const elapsed = useElapsed(generating, startedAt);
	const failures = blocks.filter(
		(block) => block.type === "tool_call" && block.status === "failed",
	).length;
	const mark = generating ? "busy" : failures > 0 ? "failed" : "done";
	const time = generating ? elapsed : durationMs;

	return (
		<details className="omp-process" open={open} onToggle={onToggle}>
			<summary className="omp-process-head">
				<span className={`omp-process-mark ${mark}`}>
					{generating ? (
						<span className="omp-process-spinner" />
					) : failures > 0 ? (
						<Icon name="warning" size={11} />
					) : (
						<Icon name="check" size={11} />
					)}
				</span>
				<span className="omp-process-title">{generating ? "处理中" : "处理过程"}</span>
				<span className="omp-process-summary">
					{[summarizeProcess(blocks), failures > 0 ? `${failures} 次失败` : ""]
						.filter(Boolean)
						.join(" · ")}
				</span>
				{time !== undefined && <span className="omp-process-time">{formatDuration(time)}</span>}
				<Icon name="chevron" size={12} className="omp-fold-chevron" />
			</summary>
			<div className="omp-process-body">
				{blocks.map((block, index) => (
					<Block key={index} block={block} onOpenDoc={onOpenDoc} query={query} live={generating} />
				))}
			</div>
		</details>
	);
}

/** 从末尾往前跳过连续 text 块，返回结论区的起点下标 */
function trailingTextStart(blocks: ChatMessage["blocks"]) {
	let index = blocks.length;
	while (index > 0 && blocks[index - 1].type === "text") index -= 1;
	return index;
}
