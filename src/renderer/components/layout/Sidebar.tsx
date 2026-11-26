/**
 * 侧栏：新建任务、技能入口、会话列表（最近 / 按工作目录分组）、底部设置。
 * 会话状态由上层推导后传入，这里只负责展示与选择。
 * 批量删除：勾选任意会话后底部出现批量操作栏，可全选（限当前列表）或删除。
 */

import { useState } from "react";
import { dirName, shortPath } from "../../core/format";
import type { Session, SidebarView } from "../../core/session-filters";
import { Icon } from "../common/Icon";
import { SessionRow } from "./SessionRow";

interface SidebarProps {
	collapsed: boolean;
	sessions: Session[];
	activeId: string | null;
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
	onNew(): void;
	onOpenSkills(): void;
	onOpenSettings(): void;
	onViewChange(view: SidebarView): void;
}

export function Sidebar({
	collapsed,
	sessions,
	activeId,
	running,
	view,
	filtersActive,
	cwd,
	connected,
	onSelect,
	onTogglePin,
	onRename,
	onOpenFolder,
	onDelete,
	onDeleteMany,
	onNew,
	onOpenSkills,
	onOpenSettings,
	onViewChange,
}: SidebarProps) {
	// 按工作空间分组时，每个分组可以单独收起；默认全部展开
	const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
	// 批量选择：记录被勾选的会话 id，非空即进入批量态
	const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
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
		setCheckedIds(new Set());
		if (targets.length > 0) onDeleteMany(targets);
	};
	const clearChecked = () => setCheckedIds(new Set());
	const toggleGroup = (group: string) =>
		setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));

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
						{Object.entries(
							sessions.reduce<Record<string, Session[]>>((groups, session) => {
								const key = session.cwd || cwd;
								(groups[key] ||= []).push(session);
								return groups;
							}, {}),
						).map(([group, items]) => {
							const isCollapsed = Boolean(collapsedGroups[group]);
							return (
								<div key={group} className="omp-session-group">
									<button
										type="button"
										className={`omp-group-head ${isCollapsed ? "collapsed" : ""}`}
										onClick={() => toggleGroup(group)}
										aria-expanded={!isCollapsed}
										title={group}
									>
										<Icon name="chevron" size={12} className="omp-group-chevron" />
										<Icon name="folder" size={14} />
										<span>{dirName(group)}</span>
										<span className="omp-count">{items.length}</span>
									</button>
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
		</aside>
	);
}
