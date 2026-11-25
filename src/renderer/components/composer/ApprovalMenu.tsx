/**
 * 输入区底栏的「安全等级」下拉：改变 omp 的审批策略（只读 / 自动 / 全部允许）。
 */

import type { RefObject } from "react";
import type { ApprovalMode } from "../../../shared/types";
import { APPROVAL_HINT, APPROVAL_LABEL, APPROVAL_OPTIONS } from "../../core/labels";
import { Icon } from "../common/Icon";

interface ApprovalMenuProps {
	open: boolean;
	mode: ApprovalMode;
	wrapRef: RefObject<HTMLSpanElement | null>;
	onToggle(): void;
	onSelect(mode: ApprovalMode): void;
}

export function ApprovalMenu({ open, mode, wrapRef, onToggle, onSelect }: ApprovalMenuProps) {
	return (
		<span className="omp-approval-wrap" ref={wrapRef}>
			<button
				type="button"
				className={`omp-approval-trigger ${open ? "active" : ""}`}
				onClick={onToggle}
				title={`安全等级：${APPROVAL_LABEL[mode]}`}
				aria-label="安全等级"
				aria-haspopup="menu"
				aria-expanded={open}
			>
				<Icon name="shield" size={13} />
				<span className="omp-btn-label">{APPROVAL_LABEL[mode]}</span>
				<Icon name="chevron" size={12} />
			</button>
			{open && (
				<div className="omp-approval-menu" role="menu" aria-label="安全等级">
					{APPROVAL_OPTIONS.map((option) => (
						<button
							key={option}
							type="button"
							role="menuitemradio"
							aria-checked={mode === option}
							className={`omp-approval-item ${mode === option ? "active" : ""}`}
							onClick={() => onSelect(option)}
						>
							<span className="omp-approval-item-main">
								<span>{APPROVAL_LABEL[option]}</span>
								{mode === option && <Icon name="check" size={13} />}
							</span>
							<span className="omp-approval-item-hint">{APPROVAL_HINT[option]}</span>
						</button>
					))}
				</div>
			)}
		</span>
	);
}
