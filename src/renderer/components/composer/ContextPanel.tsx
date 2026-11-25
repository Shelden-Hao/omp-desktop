/**
 * 上下文用量：环形进度按钮 + 展开面板。
 * 数据来自 omp `/context`（见 core/context-report.ts 的解析），拿不到时降级为「—」。
 */

import type { RefObject } from "react";
import type { ContextReport } from "../../../shared/types";
import { formatContext, formatTokens } from "../../core/format";
import { Icon } from "../common/Icon";
import { ContextMeter, ContextRing } from "../chat/ContextMeter";

interface ContextPanelProps {
	open: boolean;
	percent: number;
	report: ContextReport | undefined;
	shortModelName: string;
	wrapRef: RefObject<HTMLSpanElement | null>;
	onToggle(): void;
	onClose(): void;
}

export function ContextPanel({
	open,
	percent,
	report,
	shortModelName,
	wrapRef,
	onToggle,
	onClose,
}: ContextPanelProps) {
	return (
		<span className="omp-context-wrap" ref={wrapRef}>
			<button
				type="button"
				className={`omp-context-trigger ${open ? "active" : ""} ${
					percent >= 85 ? "danger" : percent >= 60 ? "warn" : ""
				}`}
				onClick={onToggle}
				title={report ? `上下文已用 ${report.percent.toFixed(1)}%` : "查看上下文用量"}
				aria-label="上下文用量"
			>
				<ContextRing percent={percent} />
			</button>
			{open && (
				<div className="omp-context-panel" role="dialog" aria-label="上下文用量">
					<div className="omp-context-head">
						<span>上下文用量</span>
						<button type="button" className="omp-context-close" onClick={onClose} aria-label="关闭">
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
						{report ? `${formatContext(report.contextWindow)} 上下文` : "上下文窗口未知"}
						{shortModelName ? ` · ${shortModelName}` : ""}
					</div>
				</div>
			)}
		</span>
	);
}
