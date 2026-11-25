/**
 * 技能面板容器：只负责布局、分页切换与浮层开关，数据与动作在 use-skills-panel。
 * 全局技能由 omp 在 ~/.omp/agent/skills 等目录发现，项目技能在 <cwd>/.omp/skills，
 * 启停通过 omp 的 skills.ignoredSkills 配置，不在外壳侧另造状态。
 */
import { useEffect, useRef, useState } from "react";
import type { SkillScope } from "../../../shared/types";
import { InstalledSkillCard, MarketSkillCard } from "./SkillCard";
import { CreateSkillDialog, PublishSkillDialog } from "./SkillDialogs";
import { SkillDetail } from "./SkillDetail";
import { SORT_LABEL } from "./labels";
import type { SkillSort, SkillsPanelProps } from "./types";
import { useSkillsPanel } from "./use-skills-panel";

export function SkillsPanel({
	cwd,
	autoInstallTrustedSkills,
	onClose,
	onUseSkill,
}: SkillsPanelProps) {
	const data = useSkillsPanel({ cwd, autoInstallTrustedSkills });
	const [addMenu, setAddMenu] = useState(false);
	const [showCreate, setShowCreate] = useState(false);
	const [showPublish, setShowPublish] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);
	const addRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const onPointer = (event: MouseEvent) => {
			if (addRef.current && !addRef.current.contains(event.target as Node)) setAddMenu(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("mousedown", onPointer);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onPointer);
			document.removeEventListener("keydown", onKey);
		};
	}, [onClose]);

	const { selected, setSelected } = data;

	return (
		<div className="omp-skill-layer" role="dialog" aria-modal="true" aria-label="技能管理">
			<div className="omp-skill-panel">
				<header className="omp-skill-header">
					<div className="omp-skill-brand">
						<span className="omp-skill-title">技能</span>
						<span className="omp-skill-subtitle">管理 omp 使用的本地与市场技能</span>
					</div>
					<div className="omp-skill-header-tools">
						<div className="omp-skill-search">
							<span>⌕</span>
							<input
								ref={searchRef}
								value={data.query}
								placeholder="搜索技能（Skillshare 市场）"
								onChange={(event) => {
									data.setQuery(event.target.value);
									if (event.target.value) data.setTab("market");
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter") void data.runSearch(data.query);
								}}
							/>
						</div>
						<div className="omp-skill-add" ref={addRef}>
							<button
								type="button"
								className="omp-skill-add-btn"
								onClick={() => setAddMenu((value) => !value)}
							>
								+ 添加技能
							</button>
							{addMenu && (
								<div className="omp-skill-menu">
									<button
										type="button"
										onClick={() => {
											setAddMenu(false);
											data.setTab("market");
											searchRef.current?.focus();
										}}
									>
										查找技能
									</button>
									<button
										type="button"
										onClick={() => {
											setAddMenu(false);
											setShowPublish(true);
										}}
									>
										上传技能
									</button>
									<button
										type="button"
										onClick={() => {
											setAddMenu(false);
											setShowCreate(true);
										}}
									>
										创建技能
									</button>
								</div>
							)}
						</div>
						<button type="button" className="omp-skill-close" onClick={onClose} aria-label="关闭">
							×
						</button>
					</div>
				</header>

				{data.notice && <div className="omp-skill-notice">{data.notice}</div>}
				{data.error && <div className="omp-skill-notice error">{data.error}</div>}

				<div className="omp-skill-tabs">
					<button
						type="button"
						className={data.tab === "installed" ? "active" : ""}
						onClick={() => data.setTab("installed")}
					>
						已安装（{data.skills.length + data.disabledNames.length}）
					</button>
					<button
						type="button"
						className={data.tab === "market" ? "active" : ""}
						onClick={() => data.setTab("market")}
					>
						技能市场
					</button>
				</div>

				{data.tab === "installed" ? (
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
							<button
								type="button"
								className="omp-skill-mini"
								onClick={() => void data.loadInstalled()}
							>
								刷新
							</button>
						</div>
						<p className="omp-skill-hint">
							全局目录 {data.paths?.userDir ?? "读取中"} · 项目目录{" "}
							{data.paths?.projectDir ?? "读取中"}
							<br />
							技能文件为 SKILL.md；项目技能放在工作目录的 .omp/skills 或 .agents/skills 下，由 omp
							自动发现。
						</p>
						{data.loading ? (
							<div className="omp-skill-empty">正在读取 omp 技能…</div>
						) : (
							<>
								{data.userSkills.length > 0 && (
									<section className="omp-skill-section">
										<h4>用户级 · 全局（{data.userSkills.length}）</h4>
										<div className="omp-skill-grid">
											{data.userSkills.map((skill) => (
												<InstalledSkillCard
													key={skill.name}
													skill={skill}
													busy={data.busyName === skill.name}
													onOpen={() =>
														void data.openDetail({ kind: "installed", skill, enabled: true })
													}
													onToggle={() => void data.toggleSkill(skill, false)}
													onUse={() => onUseSkill(skill.name)}
													onUninstall={() => void data.uninstall(skill)}
												/>
											))}
										</div>
									</section>
								)}
								{data.projectSkills.length > 0 && (
									<section className="omp-skill-section">
										<h4>项目级 · 当前工作目录（{data.projectSkills.length}）</h4>
										<div className="omp-skill-grid">
											{data.projectSkills.map((skill) => (
												<InstalledSkillCard
													key={skill.name}
													skill={skill}
													busy={data.busyName === skill.name}
													onOpen={() =>
														void data.openDetail({ kind: "installed", skill, enabled: true })
													}
													onToggle={() => void data.toggleSkill(skill, false)}
													onUse={() => onUseSkill(skill.name)}
													onUninstall={() => void data.uninstall(skill)}
												/>
											))}
										</div>
									</section>
								)}
								{data.disabledNames.length > 0 && data.scopeFilter !== "project" && (
									<section className="omp-skill-section">
										<h4>已禁用（{data.disabledNames.length}）</h4>
										<div className="omp-skill-grid">
											{data.disabledSkills.map((skill) => (
												<InstalledSkillCard
													key={skill.name}
													skill={skill}
													enabled={false}
													busy={data.busyName === skill.name}
													onOpen={() =>
														void data.openDetail({ kind: "installed", skill, enabled: false })
													}
													onToggle={() => void data.toggleSkill(skill, true)}
													onUse={() => onUseSkill(skill.name)}
													onUninstall={() => void data.uninstall(skill)}
												/>
											))}
										</div>
									</section>
								)}
								{data.activeCount === 0 && data.disabledNames.length === 0 && (
									<div className="omp-skill-empty">
										当前目录没有发现技能。用「添加技能 → 创建技能」新建，或将 SKILL.md 放进
										.omp/skills 目录。
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
				) : (
					<div className="omp-skill-content">
						<div className="omp-skill-toolbar">
							<div className="omp-skill-scope-switch" role="group" aria-label="排序">
								{(Object.keys(SORT_LABEL) as SkillSort[]).map((value) => (
									<button
										key={value}
										type="button"
										className={data.sort === value ? "active" : ""}
										onClick={() => data.setSort(value)}
									>
										{SORT_LABEL[value]}
									</button>
								))}
							</div>
							<div className="omp-skill-scope-switch" role="group" aria-label="安装范围">
								{(["user", "project"] as SkillScope[]).map((value) => (
									<button
										key={value}
										type="button"
										className={data.installScope === value ? "active" : ""}
										onClick={() => data.setInstallScope(value)}
									>
										{value === "user" ? "装到全局" : "装到项目"}
									</button>
								))}
							</div>
						</div>
						{!data.query.trim() ? (
							<div className="omp-skill-empty">
								输入关键词搜索 Skillshare 技能；结果由 omp 注册表实时返回。
							</div>
						) : data.searching ? (
							<div className="omp-skill-empty">正在搜索…</div>
						) : data.hits.length === 0 ? (
							<div className="omp-skill-empty">没有找到匹配的技能。</div>
						) : (
							<>
								<p className="omp-skill-hint">找到 {data.hits.length} 个技能</p>
								<div className="omp-skill-grid">
									{data.hits.map((hit) => (
										<MarketSkillCard
											key={hit.fullName}
											hit={hit}
											busy={data.busyName === hit.fullName}
											installScope={data.installScope}
											onOpen={() => void data.openDetail({ kind: "market", hit })}
											onInstall={() => void data.install(hit)}
										/>
									))}
								</div>
							</>
						)}
					</div>
				)}

				{selected && (
					<SkillDetail
						selected={selected}
						detail={data.detail}
						detailBusy={data.detailBusy}
						installScope={data.installScope}
						onClose={() => setSelected(null)}
						onInstall={() => {
							if (selected.kind === "market") void data.install(selected.hit);
							setSelected(null);
						}}
						onUse={() => {
							if (selected.kind === "installed") onUseSkill(selected.skill.name);
							setSelected(null);
						}}
						onToggle={() => {
							if (selected.kind === "installed") {
								void data.toggleSkill(selected.skill, !selected.enabled);
							}
						}}
					/>
				)}

				{showCreate && (
					<CreateSkillDialog
						onCancel={() => setShowCreate(false)}
						onSubmit={(input) => data.createSkill(input)}
					/>
				)}

				{showPublish && (
					<PublishSkillDialog
						onCancel={() => setShowPublish(false)}
						onSubmit={(dir, scope) => data.publishSkill(dir, scope)}
					/>
				)}
			</div>
		</div>
	);
}
