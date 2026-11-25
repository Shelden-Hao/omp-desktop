/**
 * 消息导航：对话右侧按「我的消息」打点，悬浮展开成列表，点一下跳到对应位置。
 * 位置用一个绝对定位的轨道，不参与消息滚动。
 */

import { useEffect, useMemo, useState, type RefObject } from "react";
import type { ChatMessage } from "../../../shared/types";

interface MessageRailProps {
	messages: ChatMessage[];
	scrollRef: RefObject<HTMLDivElement | null>;
}

interface RailEntry {
	id: string;
	text: string;
}

/** 一条用户消息的可读摘要：只取正文块，压平空白后截断 */
function entryText(message: ChatMessage): string {
	const text = message.blocks
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join(" ")
		// 消息里可能夹着宿主注入的标签（系统提醒、图片引用），摘要里不该出现
		.replace(/<system-reminder[\s\S]*?<\/system-reminder>/gi, " ")
		.replace(/<image[^>]*>/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!text) return "（空消息）";
	return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

export function MessageRail({ messages, scrollRef }: MessageRailProps) {
	const entries = useMemo<RailEntry[]>(
		() =>
			messages
				.filter((message) => message.role === "user")
				.map((message) => ({ id: message.id, text: entryText(message) })),
		[messages],
	);
	const [active, setActive] = useState(0);

	// 当前高亮：视口上方最近的一条用户消息
	useEffect(() => {
		const container = scrollRef.current;
		if (!container || entries.length === 0) return;
		const update = () => {
			const limit = 96;
			let current = 0;
			entries.forEach((entry, index) => {
				const node = container.querySelector<HTMLElement>(`[data-message-id="${entry.id}"]`);
				if (!node) return;
				const offset = node.getBoundingClientRect().top - container.getBoundingClientRect().top;
				if (offset <= limit) current = index;
			});
			setActive(current);
		};
		update();
		container.addEventListener("scroll", update, { passive: true });
		return () => container.removeEventListener("scroll", update);
	}, [entries, scrollRef]);

	const jumpTo = (id: string) => {
		const container = scrollRef.current;
		const node = container?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
		if (!container || !node) return;
		const top =
			container.scrollTop +
			node.getBoundingClientRect().top -
			container.getBoundingClientRect().top -
			24;
		container.scrollTo({ top, behavior: "smooth" });
	};

	if (entries.length < 2) return null;

	return (
		<div className="omp-rail" aria-label="我的消息">
			<div className="omp-rail-dots">
				{entries.map((entry, index) => (
					<button
						key={entry.id}
						type="button"
						className={`omp-rail-dot ${index === active ? "active" : ""}`}
						onClick={() => jumpTo(entry.id)}
						aria-label={`跳到第 ${index + 1} 条消息`}
						title={entry.text}
					/>
				))}
			</div>
			<div className="omp-rail-panel" role="list">
				<div className="omp-rail-title">我的消息</div>
				{entries.map((entry, index) => (
					<button
						key={entry.id}
						type="button"
						role="listitem"
						className={`omp-rail-item ${index === active ? "active" : ""}`}
						onClick={() => jumpTo(entry.id)}
						title={entry.text}
					>
						{entry.text}
					</button>
				))}
			</div>
		</div>
	);
}
