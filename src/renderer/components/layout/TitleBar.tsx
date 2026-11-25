/**
 * 标题栏：侧栏开关、任务筛选、当前会话标题、连接状态、搜索、预览开关与窗口按钮。
 * 拖拽区域由 CSS 的 -webkit-app-region 控制，这里只放可点击元素。
 */

import type { RefObject } from "react";
import {
	STATUS_FILTERS,
	TIME_FILTERS,
	type StatusFilter,
	type TimeFilter,
} from "../../core/session-filters";
import { Icon } from "../common/Icon";

interface TitleBarProps {
	sidebarCollapsed: boolean;
	onToggleSidebar(): void;
	filterOpen: boolean;
	onToggleFilter(): void;
	onCloseFilter(): void;
	filtersActive: boolean;
	statusFilter: StatusFilter;
	timeFilter: TimeFilter;
	onStatusFilter(next: StatusFilter): void;
	onTimeFilter(next: TimeFilter): void;
	onResetFilters(): void;
	activeTitle: string;
	connected: boolean;
	status: string;
	searchOpen: boolean;
	onToggleSearch(): void;
	showPreview: boolean;
	onTogglePreview(): void;
	filterRef: RefObject<HTMLSpanElement | null>;
}

export function TitleBar({
	sidebarCollapsed,
	onToggleSidebar,
	filterOpen,
	onToggleFilter,
	onCloseFilter,
	filtersActive,
	statusFilter,
	timeFilter,
	onStatusFilter,
	onTimeFilter,
	onResetFilters,
	activeTitle,
	connected,
	status,
	searchOpen,
	onToggleSearch,
	showPreview,
	onTogglePreview,
	filterRef,
}: TitleBarProps) {
	return (
		<header className="omp-titlebar">
			<div className="omp-titlebar-left">
				<span className="omp-title-tip">
					<button
						type="button"
						className={`omp-title-action ${sidebarCollapsed ? "active" : ""}`}
						onClick={() => onToggleSidebar()}
						aria-label="切换侧栏"
					>
						<Icon name="sidebar" size={14} />
					</button>
					<span className="omp-tooltip" role="tooltip">
						{sidebarCollapsed ? "显示侧栏" : "收起侧栏"}
					</span>
				</span>
				<span className="omp-title-tip omp-filter-wrap" ref={filterRef}>
					<button
						type="button"
						className={`omp-title-action ${filterOpen ? "active" : ""} ${filtersActive ? "filtered" : ""}`}
						onClick={() => onToggleFilter()}
						aria-label="筛选任务状态"
						aria-haspopup="menu"
						aria-expanded={filterOpen}
					>
						<Icon name="filter" size={14} />
						{filtersActive && <span className="omp-filter-dot" />}
					</button>
					<span className="omp-tooltip" role="tooltip">
						筛选任务状态
					</span>
					{filterOpen && (
						<div className="omp-filter-menu" role="menu">
							<div className="omp-filter-group">
								<span className="omp-filter-label">筛选状态</span>
								{STATUS_FILTERS.map((item) => (
									<button
										key={item.value}
										type="button"
										role="menuitemradio"
										aria-checked={statusFilter === item.value}
										className={`omp-filter-item ${statusFilter === item.value ? "active" : ""}`}
										onClick={() => {
											onStatusFilter(item.value);
											onCloseFilter();
										}}
									>
										<span>{item.label}</span>
										{statusFilter === item.value && <Icon name="check" size={14} />}
									</button>
								))}
							</div>
							<div className="omp-filter-group">
								<span className="omp-filter-label">筛选时间</span>
								{TIME_FILTERS.map((item) => (
									<button
										key={item.value}
										type="button"
										role="menuitemradio"
										aria-checked={timeFilter === item.value}
										className={`omp-filter-item ${timeFilter === item.value ? "active" : ""}`}
										onClick={() => {
											onTimeFilter(item.value);
											onCloseFilter();
										}}
									>
										<span>{item.label}</span>
										{timeFilter === item.value && <Icon name="check" size={14} />}
									</button>
								))}
							</div>
							<button
								type="button"
								className="omp-filter-reset"
								disabled={!filtersActive}
								onClick={() => {
									onResetFilters();
								}}
							>
								重置筛选条件
							</button>
						</div>
					)}
				</span>
				<span className="omp-title-divider" />
				<strong className="omp-title-session" title={activeTitle}>
					{activeTitle}
				</strong>
			</div>
			<div className="omp-titlebar-right">
				<span className={`omp-connection ${connected ? "online" : "offline"}`} title={status}>
					<span className="omp-connection-dot" />
					{connected ? "已连接" : "未连接"}
				</span>
				<span className="omp-title-divider" />
				<span className="omp-title-tip">
					<button
						type="button"
						className={`omp-title-action ${searchOpen ? "active" : ""}`}
						onClick={onToggleSearch}
						aria-label="对话内搜索，快捷键 Ctrl+F"
					>
						<Icon name="search" size={14} />
					</button>
					<span className="omp-tooltip" role="tooltip">
						对话内搜索 <kbd>Ctrl+F</kbd>
					</span>
				</span>
				<button
					type="button"
					className={`omp-title-action ${showPreview ? "active" : ""}`}
					onClick={() => onTogglePreview()}
					title={showPreview ? "隐藏文件预览" : "显示文件预览"}
					aria-label="切换文件预览"
				>
					<Icon name="panel" size={14} />
				</button>
				<span className="omp-title-divider" />
				<div className="omp-window-controls">
					<button
						type="button"
						onClick={() => window.desktop.window.minimize()}
						title="最小化"
						aria-label="最小化"
					>
						<Icon name="minimize" size={12} />
					</button>
					<button
						type="button"
						onClick={() => window.desktop.window.maximize()}
						title="最大化 / 还原"
						aria-label="最大化或还原"
					>
						<Icon name="maximize" size={12} />
					</button>
					<button
						type="button"
						className="close"
						onClick={() => window.desktop.window.close()}
						title="关闭"
						aria-label="关闭"
					>
						<Icon name="close" size={12} />
					</button>
				</div>
			</div>
		</header>
	);
}
