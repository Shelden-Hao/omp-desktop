/**
 * 权限确认：omp 请求执行工具操作时弹出，按钮文案与语义由 ACP 的 options 决定。
 */

import { Icon } from "../common/Icon";

interface PermissionDialogProps {
	request: {
		title: string;
		options: Array<{ optionId: string; name: string; kind: string }>;
	};
	onSelect(optionId: string): void;
}

export function PermissionDialog({ request, onSelect }: PermissionDialogProps) {
	return (
		<div className="omp-modal-layer" role="dialog" aria-modal="true" aria-label="权限确认">
			<div className="omp-modal">
				<div className="omp-modal-icon warning">
					<Icon name="warning" size={18} />
				</div>
				<h3>需要你的确认</h3>
				<p>omp 请求执行以下操作，请确认是否允许。</p>
				<div className="omp-permission-title">{request.title}</div>
				<div className="omp-modal-actions">
					{request.options.map((option) => (
						<button
							key={option.optionId}
							type="button"
							className={/reject|deny|cancel/i.test(option.kind) ? "secondary" : "primary"}
							onClick={() => onSelect(option.optionId)}
						>
							{option.name}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
