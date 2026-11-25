/** 技能卡片：已安装与市场两种形态，只在 props 上取值，不自己发请求 */
import type { SkillScope, SkillSummary } from "../../../shared/types";
import { initials, SCOPE_LABEL, scopeOf, shortNumber } from "./labels";
import type { MarketHit } from "./types";

interface InstalledCardProps {
	skill: SkillSummary;
	enabled?: boolean;
	busy: boolean;
	onOpen(): void;
	onToggle(): void;
	onUse(): void;
	onUninstall(): void;
}

export function InstalledSkillCard({
	skill,
	enabled = true,
	busy,
	onOpen,
	onToggle,
	onUse,
	onUninstall,
}: InstalledCardProps) {
	return (
		<div
			className={`omp-skill-card ${enabled ? "" : "disabled"}`}
			onClick={onOpen}
			role="button"
			tabIndex={0}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") onOpen();
			}}
		>
			<div className="omp-skill-card-icon">{initials(skill.name)}</div>
			<div className="omp-skill-card-body">
				<div className="omp-skill-card-title">{skill.name}</div>
				<p className="omp-skill-card-desc">{skill.description || "暂无描述"}</p>
				<div className="omp-skill-card-meta">
					<span className="omp-skill-tag">{skill.source}</span>
					<span>{scopeOf(skill.source) === "user" ? "全局" : "项目"}</span>
				</div>
			</div>
			<div className="omp-skill-card-actions" onClick={(event) => event.stopPropagation()}>
				<label className="omp-skill-switch" title={busy ? "处理中" : "启用 / 禁用"}>
					<input type="checkbox" checked={enabled} disabled={busy} onChange={onToggle} />
					<span />
				</label>
				{enabled && (
					<button
						type="button"
						className="omp-skill-mini"
						onClick={onUse}
						title="在会话中插入 /skill 命令"
					>
						使用
					</button>
				)}
				{enabled && (
					<button type="button" className="omp-skill-mini danger" onClick={onUninstall}>
						卸载
					</button>
				)}
			</div>
		</div>
	);
}

interface MarketCardProps {
	hit: MarketHit;
	busy: boolean;
	installScope: SkillScope;
	onOpen(): void;
	onInstall(): void;
}

export function MarketSkillCard({ hit, busy, installScope, onOpen, onInstall }: MarketCardProps) {
	return (
		<div
			className="omp-skill-card"
			onClick={onOpen}
			role="button"
			tabIndex={0}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") onOpen();
			}}
		>
			<div className="omp-skill-card-icon market">{initials(hit.name)}</div>
			<div className="omp-skill-card-body">
				<div className="omp-skill-card-title">{hit.fullName}</div>
				<p className="omp-skill-card-desc">{hit.description || "暂无描述"}</p>
				<div className="omp-skill-card-meta">
					<span>周下载 {shortNumber(hit.weeklyDownloads)}</span>
				</div>
			</div>
			<div className="omp-skill-card-actions" onClick={(event) => event.stopPropagation()}>
				<button
					type="button"
					className="omp-skill-mini primary"
					disabled={busy}
					onClick={onInstall}
					title={`安装到${SCOPE_LABEL[installScope]}`}
				>
					{busy ? "安装中" : "+ 安装"}
				</button>
			</div>
		</div>
	);
}
