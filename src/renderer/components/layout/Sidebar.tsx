/**
 * 侧栏：新建任务、技能入口、会话列表（最近 / 按工作目录分组）、底部设置。
 * 会话状态由上层推导后传入，这里只负责展示与选择。
 */

import { dirName, relativeTime, shortPath } from "../../core/format";
import type { Session, SidebarView } from "../../core/session-filters";
import { Icon } from "../common/Icon";

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
	onNew,
	onOpenSkills,
	onOpenSettings,
	onViewChange,
}: SidebarProps) {
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
							<button
								key={session.id}
								type="button"
								className={`omp-session ${session.id === activeId ? "active" : ""}`}
								onClick={() => onSelect(session)}
								title={session.title}
							>
								<Icon name="chat" size={14} />
								<span className="omp-session-title">{session.title}</span>
								{running && session.id === activeId ? (
									<span className="omp-session-spinner" title="运行中" />
								) : (
									<time>{relativeTime(session.ts)}</time>
								)}
							</button>
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
								const key = dirName(session.cwd || cwd);
								(groups[key] ||= []).push(session);
								return groups;
							}, {}),
						).map(([group, items]) => (
							<div key={group} className="omp-session-group">
								<div className="omp-group-head">
									<Icon name="folder" size={14} />
									<span>{group}</span>
									<span className="omp-count">{items.length}</span>
								</div>
								{items.map((session) => (
									<button
										key={session.id}
										type="button"
										className={`omp-session grouped ${session.id === activeId ? "active" : ""}`}
										onClick={() => onSelect(session)}
										title={session.title}
									>
										<span className="omp-session-title">{session.title}</span>
										{running && session.id === activeId ? (
											<span className="omp-session-spinner" title="运行中" />
										) : (
											<time>{relativeTime(session.ts)}</time>
										)}
									</button>
								))}
							</div>
						))}
					</div>
				)}
			</div>

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
