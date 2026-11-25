/**
 * 对话消息区：空状态引导、消息列表、处理过程折叠、回到底部按钮。
 *
 * 这里只做「给定消息列表怎么画」，滚动与搜索高亮由上层提供的回调驱动；
 * 消息如何归约（流式拼接、工具调用状态）在 core/acp 与 App 的状态里完成。
 */

import type { RefObject } from "react";
import type { ChatMessage } from "../../../shared/types";
import { formatDuration } from "../../core/format";
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
	const hasPendingTool = message.blocks.some(
		(block) => block.type === "tool_call" && block.status === "pending",
	);
	const generating = message.role === "agent" && (isActive || hasPendingTool);

	return (
		<article className={`omp-message ${message.role}`} data-message-id={message.id}>
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
				{message.role === "agent" && (
					<div className={`omp-agent-status ${generating ? "busy" : ""}`}>
						<Icon name={generating ? "spark" : "check"} size={11} />
						<span>
							{generating ? "生成中" : "已完成"}
							{!generating && message.durationMs !== undefined
								? ` ${formatDuration(message.durationMs)}`
								: ""}
						</span>
					</div>
				)}
				{message.blocks.length > 0 && (
					<div className="omp-message-content">
						{message.blocks.map((block, index) => (
							<Block key={index} block={block} onOpenDoc={onOpenDoc} query={query} />
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
