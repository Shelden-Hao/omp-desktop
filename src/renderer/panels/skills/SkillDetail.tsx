/** 技能详情浮层：市场技能读取 omp info，已安装技能展示文件路径与启停入口 */
import type { SkillScope } from "../../../shared/types";
import { detailText, initials, SCOPE_LABEL } from "./labels";
import type { SkillSelection } from "./types";

interface SkillDetailProps {
	selected: NonNullable<SkillSelection>;
	detail: Record<string, unknown> | null;
	detailBusy: boolean;
	installScope: SkillScope;
	onClose(): void;
	onInstall(): void;
	onUse(): void;
	onToggle(): void;
}

export function SkillDetail({
	selected,
	detail,
	detailBusy,
	installScope,
	onClose,
	onInstall,
	onUse,
	onToggle,
}: SkillDetailProps) {
	const name = selected.kind === "market" ? selected.hit.fullName : selected.skill.name;
	return (
		<div className="omp-skill-detail-layer" onClick={onClose}>
			<div className="omp-skill-detail" onClick={(event) => event.stopPropagation()}>
				<div className="omp-skill-detail-head">
					<span className="omp-skill-card-icon">{initials(name)}</span>
					<div>
						<h3>{name}</h3>
						<p>
							{selected.kind === "market"
								? "Skillshare 市场技能"
								: `${selected.skill.source} · ${selected.enabled ? "已启用" : "已禁用"}`}
						</p>
					</div>
					<button type="button" className="omp-skill-close" onClick={onClose}>
						×
					</button>
				</div>
				<p className="omp-skill-detail-desc">
					{selected.kind === "market" ? selected.hit.description : selected.skill.description}
				</p>
				{detailBusy && <p className="omp-skill-hint">正在读取技能详情…</p>}
				{detail && (
					<div className="omp-skill-detail-facts">
						{Object.entries(detail)
							.filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
							.slice(0, 12)
							.map(([key, value]) => (
								<div key={key}>
									<span>{key}</span>
									<strong>{detailText(value)}</strong>
								</div>
							))}
					</div>
				)}
				{selected.kind === "installed" && selected.skill.filePath && (
					<div className="omp-skill-detail-facts">
						<div>
							<span>技能文件</span>
							<strong className="omp-skill-path">{selected.skill.filePath}</strong>
						</div>
					</div>
				)}
				<div className="omp-skill-modal-actions">
					{selected.kind === "market" ? (
						<button type="button" className="primary" onClick={onInstall}>
							安装到{SCOPE_LABEL[installScope]}
						</button>
					) : (
						<>
							{selected.enabled && (
								<button type="button" className="primary" onClick={onUse}>
									在会话中使用
								</button>
							)}
							<button type="button" onClick={onToggle}>
								{selected.enabled ? "禁用" : "启用"}
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
