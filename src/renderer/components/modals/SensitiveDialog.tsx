/**
 * 敏感信息确认：发送前本地正则命中 Key/私钥/口令时弹出，
 * 由用户决定返回修改还是仍然发送。
 */

import { Icon } from "../common/Icon";

interface SensitiveDialogProps {
	hit: { label: string; text: string };
	onCancel(): void;
	onConfirm(): void;
}

export function SensitiveDialog({ hit, onCancel, onConfirm }: SensitiveDialogProps) {
	return (
		<div className="omp-modal-layer" role="dialog" aria-modal="true" aria-label="敏感信息确认">
			<div className="omp-modal">
				<div className="omp-modal-icon warning">
					<Icon name="shield" size={18} />
				</div>
				<h3>检测到疑似敏感信息</h3>
				<p>
					这条消息里包含「{hit.label}
					」。发送后会作为对话内容传给模型服务商，确认继续吗？
				</p>
				<div className="omp-modal-actions">
					<button type="button" className="secondary" onClick={onCancel}>
						返回修改
					</button>
					<button type="button" className="primary" onClick={onConfirm}>
						仍然发送
					</button>
				</div>
			</div>
		</div>
	);
}
