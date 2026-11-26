/**
 * 通用危险操作确认弹窗：所有不可恢复的删除（会话批量删除、分组移除、
 * 模型删除、审计清空等）都走这里，二次确认后才真正执行。
 */

import { Icon } from "../common/Icon";

interface ConfirmDialogProps {
	/** 弹窗标题，如「删除 3 个会话」 */
	title: string;
	/** 说明文案，明确告知后果不可恢复 */
	message: string;
	confirmLabel?: string;
	onConfirm(): void;
	onCancel(): void;
}

export function ConfirmDialog({
	title,
	message,
	confirmLabel = "删除",
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	return (
		<div className="omp-modal-layer" role="dialog" aria-modal="true" aria-label={title}>
			<div className="omp-modal">
				<div className="omp-modal-icon warning">
					<Icon name="warning" size={18} />
				</div>
				<h3>{title}</h3>
				<p>{message}</p>
				<div className="omp-modal-actions">
					<button type="button" className="secondary" onClick={onCancel}>
						取消
					</button>
					<button type="button" className="danger" onClick={onConfirm}>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
