/**
 * 上下文用量：底部圆环 + 分段条 + 图例，数值全部来自 omp `/context`。
 */

import type { ContextPart, ContextReport } from "../../../shared/types";
import { formatTokens } from "../../core/format";

export function ContextRing({ percent, size = 17 }: { percent: number; size?: number }) {
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

/** 分段条配色，按出现顺序取用；与图例圆点共用 */
const CONTEXT_PART_COLORS = ["#6d5efc", "#12b981", "#f59e0b", "#8b5cf6", "#ec4899", "#0ea5e9"];

/** 小于 0.1% 的分类不显示 0.0%，避免图例里出现「有占用但显示为零」的误导 */
const formatPercent = (value: number) =>
	value > 0 && value < 0.1 ? "<0.1%" : `${value.toFixed(1)}%`;

export function ContextMeter({ report }: { report: ContextReport }) {
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
