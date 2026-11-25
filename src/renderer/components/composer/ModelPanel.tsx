/**
 * 模型面板：左侧是可切换模型列表，右侧是当前模型的详细配置。
 * 配置分「有选项的行」和「无选项的行」：前者点进去展开二级列表，后者直接切换。
 */

import type { SessionConfigOption } from "../../../shared/types";
import { formatContext } from "../../core/format";
import { Icon } from "../common/Icon";

export interface ModelRowOption {
	value: string;
	label: string;
}

/** 一行可调配置；有 options 的进入二级列表，没有的直接调 onSelect */
export interface ModelRow {
	id: string;
	label: string;
	valueLabel: string;
	currentValue?: string;
	options?: ModelRowOption[];
	onSelect?: (value: string) => void;
}

export interface ModelPanelProps {
	open: boolean;
	modelName?: string;
	/** omp 提供的模型选择项（category=model 的 configOption） */
	modelOption: SessionConfigOption | null;
	/** 模型 value → 上下文窗口 token 数 */
	contexts: Record<string, number>;
	rows: ModelRow[];
	/** 当前模型的上下文窗口；与 rows 同时为空时给出「没有可调配置」提示 */
	currentContext?: number;
	/** 当前展开二级列表的行 id */
	openRowId: string | null;
	onOpenRow(rowId: string | null): void;
	onSelectModel(optionId: string, value: string): void;
	onOpenSettings(): void;
}

export function ModelPanel({
	open,
	modelName,
	modelOption,
	contexts,
	rows,
	currentContext,
	openRowId,
	onOpenRow,
	onSelectModel,
	onOpenSettings,
}: ModelPanelProps) {
	if (!open) return null;
	const activeRow = rows.find((row) => row.id === openRowId);
	const sections = modelOption?.options || [];
	return (
		<div className="omp-model-panel" role="dialog" aria-label="模型设置">
			<div className="omp-model-list">
				<div className="omp-model-list-body">
					{sections.map((item) => {
						const active = item.value === modelOption?.currentValue;
						const context = contexts[item.value];
						return (
							<button
								key={item.value}
								type="button"
								className={`omp-model-option ${active ? "active" : ""}`}
								title={item.name}
								onClick={() => {
									if (modelOption) onSelectModel(modelOption.id, item.value);
								}}
							>
								<span className="omp-model-option-name">{item.name}</span>
								{context !== undefined && (
									<span className="omp-model-option-ctx">{formatContext(context)}</span>
								)}
								{active && <Icon name="check" size={14} />}
							</button>
						);
					})}
					{!sections.length && <div className="omp-model-empty">当前 omp 未提供可切换的模型</div>}
				</div>
				<button type="button" className="omp-model-config" onClick={onOpenSettings}>
					<Icon name="settings" size={13} /> 配置自定义模型
				</button>
			</div>

			<div className="omp-model-detail">
				<div className="omp-model-detail-head">
					<strong title={modelName}>{modelName || "模型"}</strong>
					{modelOption?.currentValue && <span>{modelOption.currentValue}</span>}
				</div>
				<div className="omp-model-detail-rows">
					{activeRow ? (
						<div className="omp-model-drill">
							<button
								type="button"
								className="omp-model-drill-head"
								onClick={() => onOpenRow(null)}
							>
								<Icon name="chevron-right" size={12} />
								<span>{activeRow.label}</span>
							</button>
							<div className="omp-model-drill-body">
								{activeRow.options?.map((option) => (
									<button
										key={option.value}
										type="button"
										className={`omp-model-sub ${option.value === activeRow.currentValue ? "active" : ""}`}
										onClick={() => {
											activeRow.onSelect?.(option.value);
											onOpenRow(null);
										}}
									>
										<span>{option.label}</span>
										{option.value === activeRow.currentValue && <Icon name="check" size={13} />}
									</button>
								))}
							</div>
						</div>
					) : (
						<>
							{rows.map((row) => (
								<div className="omp-model-row" key={row.id}>
									<button
										type="button"
										className="omp-model-row-btn"
										onClick={() => {
											if (row.options?.length) {
												onOpenRow(row.id);
												return;
											}
											row.onSelect?.("");
										}}
									>
										<span className="omp-model-row-label">{row.label}</span>
										<span className="omp-model-row-value">
											{row.valueLabel}
											{row.options?.length ? <Icon name="chevron-right" size={12} /> : null}
										</span>
									</button>
								</div>
							))}
							{currentContext !== undefined && (
								<div className="omp-model-row static">
									<span className="omp-model-row-label">上下文窗口</span>
									<span className="omp-model-row-value">{formatContext(currentContext)}</span>
								</div>
							)}
							{rows.length === 0 && currentContext === undefined && (
								<div className="omp-model-empty">当前模型没有可调配置。</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
