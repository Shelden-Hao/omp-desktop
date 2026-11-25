/**
 * 技能面板容器：只负责头部、分页切换与浮层开关。
 * 数据与动作在 use-skills-panel，两个分页的布局分别在 InstalledTab / MarketTab。
 *
 * 全局技能由 omp 在 ~/.omp/agent/skills 等目录发现，项目技能在 <cwd>/.omp/skills，
 * 启停通过 omp 的 skills.ignoredSkills 配置，不在外壳侧另造状态。
 */
import { useEffect, useRef, useState } from "react";
import { InstalledTab } from "./InstalledTab";
import { MarketTab } from "./MarketTab";
import { CreateSkillDialog, PublishSkillDialog } from "./SkillDialogs";
import { SkillDetail } from "./SkillDetail";
import type { SkillsPanelProps } from "./types";
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
					<InstalledTab data={data} onUseSkill={onUseSkill} />
				) : (
					<MarketTab data={data} />
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
