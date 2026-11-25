/**
 * 输入框上方的联想列表：`/` 触发技能、`@` 触发引用资源。
 *
 * 两者的 DOM 结构原本是两段重复 JSX，这里合成一个受控列表组件：
 * 只负责「画一组选项 + 报告悬停/选中」，「选中后做什么」由调用方决定。
 */

import type { ReactNode } from "react";
import { Icon } from "../common/Icon";
import type { IconName } from "../common/Icon";

export interface SuggestEntry {
	/** 同组内唯一 */
	key: string;
	/** 左侧图标槽：图标组件或首字母 */
	icon: ReactNode;
	title: string;
	detail: string;
}

export interface SuggestMenuProps {
	/** 列表标题，如「引用资源」 */
	label: string;
	/** 括号里的计数 */
	count: number;
	/** 无结果时的提示文案 */
	empty: string;
	entries: SuggestEntry[];
	activeIndex: number;
	onHover(index: number): void;
	onSelect(index: number): void;
	/** 列表底部的附加动作，如「从本地选择文件…」 */
	footer?: { icon: IconName; label: string; onSelect(): void };
}

export function SuggestMenu({
	label,
	count,
	empty,
	entries,
	activeIndex,
	onHover,
	onSelect,
	footer,
}: SuggestMenuProps) {
	return (
		<div
			className="omp-skill-suggest"
			role="listbox"
			aria-label={label}
			// 按下时阻止默认行为，否则 contenteditable 先失焦，列表在 click 之前就关了
			onMouseDown={(event) => event.preventDefault()}
		>
			<div className="omp-skill-suggest-head">
				{label} ({count})
			</div>
			{entries.length === 0 ? (
				<div className="omp-skill-suggest-empty">{empty}</div>
			) : (
				entries.map((entry, index) => (
					<button
						key={entry.key}
						type="button"
						role="option"
						aria-selected={index === activeIndex}
						className={`omp-skill-suggest-item ${index === activeIndex ? "active" : ""}`}
						onMouseEnter={() => onHover(index)}
						onClick={() => onSelect(index)}
					>
						<span className="omp-skill-suggest-icon">{entry.icon}</span>
						<span className="omp-skill-suggest-main">
							<strong>{entry.title}</strong>
							<span>{entry.detail}</span>
						</span>
					</button>
				))
			)}
			{footer && (
				<button type="button" className="omp-skill-suggest-action" onClick={footer.onSelect}>
					<Icon name={footer.icon} size={13} /> {footer.label}
				</button>
			)}
		</div>
	);
}
