/** 已安装分页：范围筛选、目录提示、用户级/项目级/已禁用三组卡片 */
import { InstalledSkillCard } from "./SkillCard";
import type { SkillsPanelState } from "./use-skills-panel";

interface InstalledTabProps {
	data: SkillsPanelState;
	onUseSkill(name: string): void;
}

export function InstalledTab({ data, onUseSkill }: InstalledTabProps) {
	const renderGroup = (title: string, list: typeof data.userSkills, enabled: boolean) => (
		<section className="omp-skill-section">
			<h4>
				{title}（{list.length}）
			</h4>
			<div className="omp-skill-grid">
				{list.map((skill) => (
					<InstalledSkillCard
						key={skill.name}
						skill={skill}
						enabled={enabled}
						busy={data.busyName === skill.name}
						onOpen={() => void data.openDetail({ kind: "installed", skill, enabled })}
						onToggle={() => void data.toggleSkill(skill, !enabled)}
						onUse={() => onUseSkill(skill.name)}
						onUninstall={() => void data.uninstall(skill)}
					/>
				))}
			</div>
		</section>
	);

	return (
		<div className="omp-skill-content">
			<div className="omp-skill-toolbar">
				<div className="omp-skill-scope-switch" role="group" aria-label="技能范围">
					{(["all", "user", "project"] as const).map((value) => (
						<button
							key={value}
							type="button"
							className={data.scopeFilter === value ? "active" : ""}
							onClick={() => data.setScopeFilter(value)}
						>
							{value === "all" ? "全部" : value === "user" ? "用户级" : "项目级"}
						</button>
					))}
				</div>
				<button type="button" className="omp-skill-mini" onClick={() => void data.loadInstalled()}>
					刷新
				</button>
			</div>
			<p className="omp-skill-hint">
				全局目录 {data.paths?.userDir ?? "读取中"} · 项目目录 {data.paths?.projectDir ?? "读取中"}
				<br />
				技能文件为 SKILL.md；项目技能放在工作目录的 .omp/skills 或 .agents/skills 下，由 omp
				自动发现。
			</p>
			{data.loading ? (
				<div className="omp-skill-empty">正在读取 omp 技能…</div>
			) : (
				<>
					{data.userSkills.length > 0 && renderGroup("用户级 · 全局", data.userSkills, true)}
					{data.projectSkills.length > 0 &&
						renderGroup("项目级 · 当前工作目录", data.projectSkills, true)}
					{data.disabledNames.length > 0 &&
						data.scopeFilter !== "project" &&
						renderGroup("已禁用", data.disabledSkills, false)}
					{data.activeCount === 0 && data.disabledNames.length === 0 && (
						<div className="omp-skill-empty">
							当前目录没有发现技能。用「添加技能 → 创建技能」新建，或将 SKILL.md 放进 .omp/skills
							目录。
						</div>
					)}
					{data.warnings.length > 0 && (
						<details className="omp-skill-warnings">
							<summary>omp 发现警告（{data.warnings.length}）</summary>
							{data.warnings.map((warning, index) => (
								<p key={index}>{warning}</p>
							))}
						</details>
					)}
				</>
			)}
		</div>
	);
}
