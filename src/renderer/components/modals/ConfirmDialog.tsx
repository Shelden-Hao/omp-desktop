/**
 * 通用二次确认弹窗：归档会话、移除分组、删除模型、清空审计等
 * 需要用户明确知晓后果的操作都走这里，确认后才真正执行。
 */

import { Icon } from "../common/Icon";

interface ConfirmDialogProps {
	/** 弹窗标题，如「归档 3 个会话」 */
	title: string;
	/** 说明文案，明确告知操作后果 */
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
