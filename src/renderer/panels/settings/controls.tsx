import type { ReactNode } from "react";

export function Row({
	title,
	desc,
	children,
	disabled,
	badge,
}: {
	title: string;
	desc: ReactNode;
	children?: ReactNode;
	disabled?: boolean;
	badge?: string;
}) {
	return (
		<div className={`omp-set-row ${disabled ? "is-disabled" : ""}`}>
			<div className="omp-set-row-text">
				<div className="omp-set-row-title">
					{title}
					{badge && <span className="omp-set-badge">{badge}</span>}
				</div>
				<p className="omp-set-row-desc">{desc}</p>
			</div>
			<div className="omp-set-row-control">{children}</div>
		</div>
	);
}

export function Toggle({
	checked,
	onChange,
	label,
	disabled,
}: {
	checked: boolean;
	onChange(next: boolean): void;
	label: string;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			disabled={disabled}
			className={`omp-set-toggle ${checked ? "active" : ""}`}
			onClick={() => onChange(!checked)}
		>
			<span />
		</button>
	);
}
