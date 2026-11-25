/**
 * 输入区左侧「+」聚合入口：把添加文件、引用资源、模式、技能、连接器收进一个菜单，
 * 避免底栏被五六个按钮挤满（窄窗口会换行）。
 *
 * 菜单自身只负责展开/收起与二级菜单切换，选中后的动作全部回调给上层。
 */

import type { RefObject } from "react";
import type { McpServerInfo, SessionModeState } from "../../../shared/types";
import { pickLabel } from "../../core/format";
import { MODE_LABEL } from "../../core/labels";
import { Icon } from "../common/Icon";

/** 聚合菜单里可展开的二级菜单 */
export type EntrySubmenu = "mode" | "skills" | "connectors" | null;

interface EntryMenuProps {
	open: boolean;
	submenu: EntrySubmenu;
	onToggleOpen(): void;
	onChangeSubmenu(next: EntrySubmenu): void;
	/** 二级菜单选中后统一收起菜单 */
	onClose(): void;
	menuRef: RefObject<HTMLSpanElement | null>;
	currentModeName?: string;
	modes: SessionModeState | null;
	onSelectMode(modeId: string): void;
	skills: Array<{ name: string; description: string }>;
	onSelectSkill(name: string): void;
	onManageSkills(): void;
	mcpConfig: { servers: McpServerInfo[] } | null;
	onInsertFile(): void;
	onOpenResourceSuggest(): void;
}

export function EntryMenu({
	open,
	submenu,
	onToggleOpen,
	onChangeSubmenu,
	onClose,
	menuRef,
	currentModeName,
	modes,
	onSelectMode,
	skills,
	onSelectSkill,
	onManageSkills,
	mcpConfig,
	onInsertFile,
	onOpenResourceSuggest,
}: EntryMenuProps) {
	return (
		<span className="omp-entry-wrap" ref={menuRef}>
			<button
				type="button"
				className={`omp-reference ${open ? "active" : ""}`}
				onClick={onToggleOpen}
				title="添加文件、引用资源、模式、技能与连接器"
				aria-label="添加"
				aria-haspopup="menu"
				aria-expanded={open}
			>
				<Icon name="plus" size={15} />
			</button>
			{open && (
				<div className="omp-entry-menu" role="menu" aria-label="添加与引用">
					<button
						type="button"
						role="menuitem"
						className="omp-entry-item"
						onClick={() => {
							onClose();
							onInsertFile();
						}}
					>
						<Icon name="folder" size={14} />
						<span>添加文件</span>
						<span className="omp-entry-item-hint">从本地选择</span>
					</button>
					<button
						type="button"
						role="menuitem"
						className="omp-entry-item"
						onClick={() => {
							onClose();
							onOpenResourceSuggest();
						}}
					>
						<Icon name="file" size={14} />
						<span>引用资源</span>
						<span className="omp-entry-item-hint">文件 / 网址</span>
					</button>
					<button
						type="button"
						role="menuitem"
						className={`omp-entry-item ${submenu === "mode" ? "active" : ""}`}
						onClick={() => onChangeSubmenu(submenu === "mode" ? null : "mode")}
					>
						<Icon name="rotate" size={14} />
						<span>模式</span>
						<span className="omp-entry-item-hint">{currentModeName}</span>
						<Icon name="chevron-right" size={12} />
					</button>
					<button
						type="button"
						role="menuitem"
						className={`omp-entry-item ${submenu === "skills" ? "active" : ""}`}
						onClick={() => onChangeSubmenu(submenu === "skills" ? null : "skills")}
					>
						<Icon name="spark" size={14} />
						<span>技能</span>
						<span className="omp-entry-item-hint">{skills.length}</span>
						<Icon name="chevron-right" size={12} />
					</button>
					<button
						type="button"
						role="menuitem"
						className={`omp-entry-item ${submenu === "connectors" ? "active" : ""}`}
						onClick={() => onChangeSubmenu(submenu === "connectors" ? null : "connectors")}
					>
						<Icon name="layers" size={14} />
						<span>连接器</span>
						<span className="omp-entry-item-hint">{mcpConfig?.servers.length ?? 0}</span>
						<Icon name="chevron-right" size={12} />
					</button>
					{submenu && (
						<div className="omp-entry-submenu">
							{submenu === "mode" && (
								<>
									<div className="omp-entry-subhead">运行模式</div>
									{(modes?.availableModes || []).map((mode) => (
										<button
											key={mode.id}
											type="button"
											className={`omp-entry-subitem ${
												mode.id === modes?.currentModeId ? "active" : ""
											}`}
											onClick={() => {
												onSelectMode(mode.id);
												onClose();
											}}
										>
											<span>{pickLabel(MODE_LABEL, mode.id, mode.name)}</span>
											{mode.id === modes?.currentModeId && <Icon name="check" size={13} />}
										</button>
									))}
									{!modes?.availableModes.length && (
										<div className="omp-entry-empty">当前会话未提供模式切换</div>
									)}
								</>
							)}
							{submenu === "skills" && (
								<>
									<div className="omp-entry-subhead">已安装技能</div>
									{skills.slice(0, 12).map((skill) => (
										<button
											key={skill.name}
											type="button"
											className="omp-entry-subitem"
											onClick={() => {
												onSelectSkill(skill.name);
												onClose();
											}}
										>
											<span>{skill.name}</span>
										</button>
									))}
									{!skills.length && <div className="omp-entry-empty">暂无已安装技能</div>}
									<button
										type="button"
										className="omp-entry-subitem manage"
										onClick={() => {
											onClose();
											onManageSkills();
										}}
									>
										<Icon name="settings" size={12} />
										<span>管理技能…</span>
									</button>
								</>
							)}
							{submenu === "connectors" && (
								<>
									<div className="omp-entry-subhead">MCP 连接器</div>
									{(mcpConfig?.servers || []).map((server) => (
										<div
											key={`${server.scope}:${server.name}`}
											className="omp-entry-subitem static"
											title={server.source}
										>
											<span>{server.name}</span>
											<span className="omp-entry-server-meta">
												{server.scope === "user" ? "全局" : "项目"} · {server.transport}
												{server.enabled ? "" : " · 已禁用"}
											</span>
										</div>
									))}
									{!mcpConfig?.servers.length && (
										<div className="omp-entry-empty">未配置连接器；omp 从 .omp/mcp.json 读取</div>
									)}
								</>
							)}
						</div>
					)}
				</div>
			)}
		</span>
	);
}
