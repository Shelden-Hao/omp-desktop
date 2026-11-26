/**
 * 侧栏：新建任务、技能入口、会话列表（最近 / 按工作目录分组）、底部设置。
 * 会话状态由上层推导后传入，这里只负责展示与选择。
 * 分组视图：分组头带「新建任务」与三点菜单（置顶/打开文件夹/编辑分组/移除分组）。
 */

import { useEffect, useState } from "react";
import { dirName, shortPath } from "../../core/format";
import type { Session, SidebarView } from "../../core/session-filters";
import { groupName, sortGroupEntries } from "../../hooks/use-workspace-meta";
import { Icon } from "../common/Icon";
import { ConfirmDialog } from "../modals/ConfirmDialog";
import { SessionRow } from "./SessionRow";

interface SidebarProps {
	collapsed: boolean;
	sessions: Session[];
	activeId: string | null;
	/** 工作区分组元数据：别名与置顶 */
	workspaces: StoredWorkspace[];
	running: boolean;
	view: SidebarView;
	filtersActive: boolean;
	cwd: string;
	connected: boolean;
	onSelect(session: Session): void;
	onTogglePin(session: Session): void;
	onRename(session: Session, title: string): void;
	onOpenFolder(session: Session): void;
	onDelete(session: Session): void;
	onDeleteMany(targets: Session[]): void;
	/** 在指定工作目录新建会话（分组头按钮） */
	onNewIn(dir: string): void;
	/** 工作区分组操作：置顶/别名/移除，持久化在 sessions.json */
	onToggleGroupPin(dir: string): void;
	onRenameGroup(dir: string, name: string): void;
	onRemoveGroup(dir: string): void;
	onNew(): void;
	onOpenSkills(): void;
	onOpenSettings(): void;
	onViewChange(view: SidebarView): void;
}

export function Sidebar({
	collapsed,
	sessions,
	activeId,
	workspaces,
	running,
	view,
	filtersActive,
	connected,
	cwd,
	onSelect,
	onTogglePin,
	onRename,
	onOpenFolder,
	onDelete,
	onDeleteMany,
	onNewIn,
	onToggleGroupPin,
	onRenameGroup,
	onRemoveGroup,
	onNew,
	onOpenSkills,
	onOpenSettings,
	onViewChange,
}: SidebarProps) {
	// 按工作空间分组时，每个分组可以单独收起；默认全部展开
	const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
	// 批量选择：记录被勾选的会话 id，非空即进入批量态
	const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
	// 危险操作二次确认：null 表示没有待确认的删除
	const [pendingDelete, setPendingDelete] = useState<
		{ kind: "batch"; targets: Session[] } | { kind: "group"; dir: string } | null
	>(null);
	const batchActive = checkedIds.size > 0;
	const checkedCount = checkedIds.size;
	const allChecked = sessions.length > 0 && sessions.every((item) => checkedIds.has(item.id));
	const toggleSelect = (session: Session) =>
		setCheckedIds((prev) => {
			const next = new Set(prev);
			if (next.has(session.id)) {
				next.delete(session.id);
			} else {
				next.add(session.id);
			}
			return next;
		});
	const toggleAll = () =>
		setCheckedIds(allChecked ? new Set() : new Set(sessions.map((item) => item.id)));
	const confirmBatchDelete = () => {
		const targets = sessions.filter((item) => checkedIds.has(item.id));
		if (targets.length === 0) return;
		setPendingDelete({ kind: "batch", targets });
	};
	const clearChecked = () => setCheckedIds(new Set());
	// 分组头三点菜单：记录展开中的分组路径，null 为全关
	const [groupMenu, setGroupMenu] = useState<string | null>(null);
	// 编辑分组名：正在改名的分组路径 + 草稿
	const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
	const [groupDraft, setGroupDraft] = useState("");
	const commitGroupRename = () => {
		if (renamingGroup) {
			const name = groupDraft.trim();
			if (name && name !== dirName(renamingGroup)) onRenameGroup(renamingGroup, name);
		}
		setRenamingGroup(null);
	};
	const toggleGroup = (group: string) =>
		setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));

	// 分组菜单点外部或按 Esc 关闭：与 SessionRow 菜单一致的行为
	useEffect(() => {
		if (!groupMenu) return;
		const onPointerDown = (event: MouseEvent) => {
			const target = event.target as HTMLElement | null;
			if (!target?.closest(".omp-group-row, .omp-group-menu")) setGroupMenu(null);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setGroupMenu(null);
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [groupMenu]);

	return (
		<aside className={`omp-sidebar ${collapsed ? "collapsed" : ""}`} aria-hidden={collapsed}>
			<div className="omp-sidebar-nav">
				<button type="button" className="omp-nav-primary" onClick={onNew} disabled={!connected}>
					<Icon name="plus" size={16} />
					<span>新建任务</span>
				</button>
				<div className="omp-nav-static">
					<Icon name="chat" size={16} />
					<span>助理</span>
					<em>本地</em>
				</div>
				<button
					type="button"
					className="omp-nav-static"
					onClick={onOpenSkills}
					title="搜索、安装与管理 omp 技能"
				>
					<Icon name="layers" size={16} />
					<span>技能</span>
				</button>
			</div>

			<div className="omp-sidebar-section">
				<div className="omp-view-tabs" role="tablist" aria-label="会话视图">
					<button
						type="button"
						role="tab"
						aria-selected={view === "recent"}
						className={view === "recent" ? "active" : ""}
						onClick={() => onViewChange("recent")}
					>
						<Icon name="clock" size={13} /> 最近
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={view === "grouped"}
						className={view === "grouped" ? "active" : ""}
						onClick={() => onViewChange("grouped")}
					>
						<Icon name="grid" size={13} /> 分组
					</button>
				</div>

				{view === "recent" ? (
					<div className="omp-session-list">
						{sessions.length === 0 && (
							<div className="omp-list-empty">
								{filtersActive ? "没有符合条件的会话" : "还没有会话"}
							</div>
						)}
						{sessions.map((session) => (
							<SessionRow
								key={session.id}
								session={session}
								active={session.id === activeId}
								running={running}
								onSelect={onSelect}
								onTogglePin={onTogglePin}
								onRename={onRename}
								onOpenFolder={onOpenFolder}
								onDelete={onDelete}
								checked={checkedIds.has(session.id)}
								batchActive={batchActive}
								onToggleSelect={toggleSelect}
							/>
						))}
					</div>
				) : (
					<div className="omp-session-list">
						{sessions.length === 0 && (
							<div className="omp-list-empty">
								{filtersActive ? "没有符合条件的会话" : "还没有会话"}
							</div>
						)}
						{sortGroupEntries(
							Object.entries(
								sessions.reduce<Record<string, Session[]>>((groups, session) => {
									const key = session.cwd || cwd;
									(groups[key] ||= []).push(session);
									return groups;
								}, {}),
							),
							workspaces,
						).map(([group, items]) => {
							const isCollapsed = Boolean(collapsedGroups[group]);
							const menuOpen = groupMenu === group;
							return (
								<div key={group} className="omp-session-group">
									{renamingGroup === group ? (
										<input
											className="omp-group-rename"
											value={groupDraft}
											autoFocus
											aria-label="编辑分组名"
											onChange={(event) => setGroupDraft(event.target.value)}
											onBlur={commitGroupRename}
											onKeyDown={(event) => {
												if (event.key === "Enter") {
													event.preventDefault();
													commitGroupRename();
												} else if (event.key === "Escape") {
													event.preventDefault();
													setRenamingGroup(null);
												}
											}}
										/>
									) : (
										<div className="omp-group-row">
											<button
												type="button"
												className={`omp-group-head ${isCollapsed ? "collapsed" : ""}`}
												onClick={() => toggleGroup(group)}
												aria-expanded={!isCollapsed}
												title={group}
											>
												<Icon name="chevron" size={12} className="omp-group-chevron" />
												<Icon name="folder" size={14} />
												<span>{groupName(group, workspaces)}</span>
												<span className="omp-count">{items.length}</span>
											</button>
											<button
												type="button"
												className="omp-group-new"
												aria-label="在此目录新建任务"
												title="新建任务"
												disabled={!connected}
												onClick={() => onNewIn(group)}
											>
												<Icon name="plus" size={13} />
											</button>
											<button
												type="button"
												className={`omp-group-more ${menuOpen ? "menu-open" : ""}`}
												aria-label="分组操作"
												aria-haspopup="menu"
												aria-expanded={menuOpen}
												onClick={() => setGroupMenu(menuOpen ? null : group)}
											>
												<Icon name="more" size={13} />
											</button>
										</div>
									)}
									{menuOpen && !renamingGroup && (
										<div className="omp-group-menu" role="menu" aria-label="工作区分组操作">
											<button
												type="button"
												role="menuitem"
												onClick={() => {
													onToggleGroupPin(group);
													setGroupMenu(null);
												}}
											>
												<Icon name="pin" size={14} />
												<span>置顶</span>
											</button>
											<button
												type="button"
												role="menuitem"
												onClick={() => {
													onOpenFolder({ id: group, title: dirName(group), cwd: group });
													setGroupMenu(null);
												}}
											>
												<Icon name="folder" size={14} />
												<span>打开文件夹</span>
											</button>
											<button
												type="button"
												role="menuitem"
												onClick={() => {
													setGroupDraft(dirName(group));
													setRenamingGroup(group);
													setGroupMenu(null);
												}}
											>
												<Icon name="pencil" size={14} />
												<span>编辑分组</span>
											</button>
											<div className="omp-session-menu-seg" />
											<button
												type="button"
												role="menuitem"
												className="danger"
												onClick={() => {
													setPendingDelete({ kind: "group", dir: group });
													setGroupMenu(null);
												}}
											>
												<Icon name="trash" size={14} />
												<span>移除分组</span>
											</button>
										</div>
									)}
									{!isCollapsed &&
										items.map((session) => (
											<SessionRow
												key={session.id}
												session={session}
												active={session.id === activeId}
												running={running}
												grouped
												onSelect={onSelect}
												onTogglePin={onTogglePin}
												onRename={onRename}
												onOpenFolder={onOpenFolder}
												onDelete={onDelete}
												checked={checkedIds.has(session.id)}
												batchActive={batchActive}
												onToggleSelect={toggleSelect}
											/>
										))}
								</div>
							);
						})}
					</div>
				)}
			</div>

			{batchActive && (
				<div className="omp-batch-bar" role="toolbar" aria-label="批量操作">
					<label className="omp-batch-all">
						<input type="checkbox" checked={allChecked} onChange={toggleAll} />
						<span>全选{checkedCount > 0 ? `（${checkedCount}）` : ""}</span>
					</label>
					<button
						type="button"
						className="omp-batch-delete"
						disabled={checkedCount === 0}
						onClick={confirmBatchDelete}
					>
						<Icon name="trash" size={14} />
						<span>删除</span>
					</button>
					<button type="button" className="omp-batch-cancel" onClick={clearChecked}>
						<Icon name="close" size={14} />
						<span>取消</span>
					</button>
				</div>
			)}

			<div className="omp-sidebar-footer">
				<div className="omp-workdir" title={cwd}>
					<Icon name="folder" size={14} />
					<span>{shortPath(cwd)}</span>
				</div>
				<button type="button" className="omp-sidebar-setting" onClick={onOpenSettings}>
					<Icon name="settings" size={14} />
					设置
				</button>
			</div>
			{pendingDelete?.kind === "batch" && (
				<ConfirmDialog
					title={`删除 ${pendingDelete.targets.length} 个会话`}
					message="会从本地列表彻底移除，且无法恢复。确认删除吗？"
					onConfirm={() => {
						const targets = pendingDelete.targets;
						setPendingDelete(null);
						setCheckedIds(new Set());
						onDeleteMany(targets);
					}}
					onCancel={() => setPendingDelete(null)}
				/>
			)}
			{pendingDelete?.kind === "group" && (
				<ConfirmDialog
					title={`移除分组「${groupName(pendingDelete.dir, workspaces)}」`}
					message="该分组下的所有会话会一并从本地删除，无法恢复。确认移除吗？"
					confirmLabel="移除"
					onConfirm={() => {
						const dir = pendingDelete.dir;
						setPendingDelete(null);
						onRemoveGroup(dir);
					}}
					onCancel={() => setPendingDelete(null)}
				/>
			)}
		</aside>
	);
}
