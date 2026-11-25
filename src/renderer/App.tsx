import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuditEntry, DesktopSettings, McpConfigInfo } from "../shared/types";
import { Icon } from "./components/common/Icon";
import { MessageList } from "./components/chat/MessageList";
import { Composer } from "./components/composer/Composer";
import type { EntrySubmenu } from "./components/composer/EntryMenu";
import { PreviewPane } from "./components/layout/PreviewPane";
import { Sidebar } from "./components/layout/Sidebar";
import { TitleBar } from "./components/layout/TitleBar";
import { PermissionDialog } from "./components/modals/PermissionDialog";
import { SensitiveDialog } from "./components/modals/SensitiveDialog";
import {
	filterSessions,
	type SidebarView,
	type StatusFilter,
	type TimeFilter,
} from "./core/session-filters";
import { useAgentCapabilities } from "./hooks/use-agent-capabilities";
import { useAgentConnection } from "./hooks/use-agent-connection";
import { useAgentPrompt } from "./hooks/use-agent-prompt";
import { useChatDocs } from "./hooks/use-chat-docs";
import { useChatScroll } from "./hooks/use-chat-scroll";
import { useComposerEditor } from "./hooks/use-composer-editor";
import { useDismiss } from "./hooks/use-dismiss";
import { useMessageStore } from "./hooks/use-message-store";
import { useRunningFlag } from "./hooks/use-running-flag";
import { useSessionSearch } from "./hooks/use-session-search";
import { SettingsPanel } from "./panels/settings";
import { SkillsPanel } from "./panels/skills";

const DEFAULT_SETTINGS: DesktopSettings = {
	ompCliPath: "",
	bunPath: "",
	cwd: "",
	theme: "system",
	approvalMode: "yolo",
	fontScale: 1,
	linkOpenMode: "ask",
	keepAwakeOnLock: false,
	preventSystemSleep: true,
	openAtLogin: false,
	proxyMode: "direct",
	proxyUrl: "",
	autoInstallTrustedSkills: false,
	autoUpdateSkills: true,
	userNickname: "",
	assistantName: "",
	replyStyle: "default",
	customInstructions: "",
	homeSuggestions: true,
	memoryMode: "off",
	autoLearnSkills: false,
	workBackground: "",
	sensitiveGuard: true,
	restrictedFolders: [],
	toolPolicies: {},
	auditEnabled: true,
};

/**
 * 应用装配层：只做三件事 —— 组织 hook 的调用顺序、持有纯界面状态、拼装 JSX。
 * 会话连接、消息存储、发送链路分别在 hooks/use-agent-* 与 use-message-store 里。
 */
export function App() {
	const [settings, setSettings] = useState<DesktopSettings>(DEFAULT_SETTINGS);
	const settingsRef = useRef<DesktopSettings | null>(null);
	const [showSettings, setShowSettings] = useState(false);
	const [showSkills, setShowSkills] = useState(false);

	const [sidebarView, setSidebarView] = useState<SidebarView>("recent");
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
	const [filterOpen, setFilterOpen] = useState(false);
	const filterRef = useRef<HTMLSpanElement>(null);

	const [modelMenuOpen, setModelMenuOpen] = useState(false);
	const [modelContexts, setModelContexts] = useState<Record<string, number>>({});
	const [openModelRow, setOpenModelRow] = useState<string | null>(null);
	const [approvalOpen, setApprovalOpen] = useState(false);
	const approvalRef = useRef<HTMLSpanElement>(null);
	const [contextOpen, setContextOpen] = useState(false);
	const contextRef = useRef<HTMLSpanElement>(null);

	const [entryMenuOpen, setEntryMenuOpen] = useState(false);
	const [entrySubmenu, setEntrySubmenu] = useState<EntrySubmenu>(null);
	const [mcpConfig, setMcpConfig] = useState<McpConfigInfo | null>(null);
	const entryMenuRef = useRef<HTMLSpanElement>(null);

	const store = useMessageStore();
	const { running, runningRef, setRunning } = useRunningFlag();

	// handleEvent 是 useCallback，读最新设置要走 ref，避免闭包拿到旧值
	useEffect(() => {
		settingsRef.current = settings;
	}, [settings]);

	/** 审计日志：只记录客户端真实发生的高风险动作，关闭时静默跳过 */
	const logAudit = useCallback((entry: Partial<AuditEntry>) => {
		if (!settingsRef.current?.auditEnabled) return Promise.resolve();
		return window.desktop.audit.add(entry).catch(() => undefined);
	}, []);

	const connection = useAgentConnection({
		store,
		runningRef,
		setRunning,
		settingsRef,
		setSettings,
		logAudit,
	});
	const { activeId, sessions, connected, status, setStatus, probeContext } = connection;
	const { messagesBySession } = store;

	const messages = useMemo(
		() => (activeId ? messagesBySession[activeId] || [] : []),
		[activeId, messagesBySession],
	);

	const docsState = useChatDocs(setStatus);
	const search = useSessionSearch(messages);

	// 输入区回车要发消息，而发送链路依赖输入区读文本：用 ref 打断这个循环
	const sendRef = useRef<(override?: string, confirmed?: boolean) => void>(() => {});
	const composer = useComposerEditor({
		docs: docsState.docs,
		messages,
		onSubmit: () => sendRef.current(),
	});
	const { setInstalledSkills } = composer;

	const scroll = useChatScroll({
		activeId,
		messages,
		running,
		permissionOpen: Boolean(connection.permission),
	});

	const prompt = useAgentPrompt({
		connection,
		store,
		composer,
		stickToBottom: scroll.stickToBottom,
		settings,
		runningRef,
		setRunning,
		logAudit,
	});
	// 每次渲染刷新转发器：它只把调用转给最新的 send，本身没有副作用
	useEffect(() => {
		sendRef.current = (override, confirmed) => void prompt.send(override, confirmed);
	}, [prompt]);

	const caps = useAgentCapabilities(connection);
	const { activeState, capabilities, modelRows, changeMode, changeConfigOption } = caps;
	const { modelOption, currentModelName, shortModelName } = capabilities;

	const filtersActive = statusFilter !== "all" || timeFilter !== "all";
	const report = activeId ? connection.contextReports[activeId] : undefined;
	const contextPercent = report ? Math.min(100, Math.max(0, report.percent)) : 0;

	// omp 不返回任务状态，这里按本地会话数据推导，避免展示没有依据的状态
	const filteredSessions = useMemo(
		() =>
			filterSessions({
				sessions,
				messagesBySession,
				statusFilter,
				timeFilter,
				running,
				activeId,
			}),
		[sessions, statusFilter, timeFilter, messagesBySession, running, activeId],
	);

	useDismiss(filterOpen, {
		ref: filterRef,
		onDismiss: () => setFilterOpen(false),
	});
	// 安全等级下拉与上下文面板：点击外部或 Esc 关闭
	useDismiss(approvalOpen, {
		ref: approvalRef,
		onDismiss: () => setApprovalOpen(false),
	});
	useDismiss(contextOpen, {
		ref: contextRef,
		onDismiss: () => setContextOpen(false),
	});

	// 聚合入口：打开时刷新技能与 MCP 配置，关闭交给 useDismiss
	useEffect(() => {
		if (!entryMenuOpen) return;
		void window.desktop.skills.list().then((reply) => {
			if (reply.ok && reply.data) setInstalledSkills(reply.data.skills);
		});
		void window.desktop.mcp
			.list()
			.then(setMcpConfig)
			.catch(() => setMcpConfig(null));
	}, [entryMenuOpen, setInstalledSkills]);

	const closeEntryMenu = () => {
		setEntryMenuOpen(false);
		setEntrySubmenu(null);
	};
	useDismiss(entryMenuOpen, { ref: entryMenuRef, onDismiss: closeEntryMenu });

	// 模型面板打开时刷新一次容量信息（用户可能刚在设置里加过自定义模型）
	useEffect(() => {
		if (!modelMenuOpen) return;
		let cancelled = false;
		window.desktop.models
			.context()
			.then((items) => {
				if (cancelled) return;
				const map: Record<string, number> = {};
				for (const item of items) {
					if (item.contextWindow) map[item.value] = item.contextWindow;
				}
				setModelContexts(map);
			})
			.catch(() => {
				// models.yml 读不到就不显示上下文窗口，不影响模型切换
			});
		return () => {
			cancelled = true;
		};
	}, [modelMenuOpen]);

	useDismiss(modelMenuOpen, {
		ignore: [".omp-model-panel", ".omp-model-trigger"],
		onDismiss: () => setModelMenuOpen(false),
	});

	useEffect(() => {
		const root = document.documentElement;
		root.dataset.theme = settings.theme;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const apply = () => {
			root.dataset.resolvedTheme =
				settings.theme === "system" ? (media.matches ? "dark" : "light") : settings.theme;
		};
		apply();
		media.addEventListener("change", apply);
		return () => media.removeEventListener("change", apply);
	}, [settings.theme]);

	useEffect(() => {
		document.documentElement.style.setProperty("--font-scale", String(settings.fontScale || 1));
	}, [settings.fontScale]);

	const saveSettings = async (next: DesktopSettings) => {
		try {
			const saved = await window.desktop.settings.set(next);
			const { ompSyncError, ...rest } = saved;
			setSettings(rest as DesktopSettings);
			if (ompSyncError) {
				// 本地已保存，但 omp 配置没写进去；面板保持打开让用户看到原因
				setStatus(`omp 配置同步失败：${ompSyncError}`);
				throw new Error(ompSyncError);
			}
			setShowSettings(false);
			setStatus("设置已保存");
		} catch (error) {
			setStatus(`设置保存失败：${(error as Error).message}`);
			throw error;
		}
	};

	const insertFileReference = async () => {
		try {
			const file = await window.desktop.files.open();
			if (!file) return;
			composer.applyResource({
				value: file.path.includes(" ") ? `@"${file.path}"` : `@${file.path}`,
				label: file.name,
				group: "对话中的文件",
				detail: file.path,
			});
		} catch (error) {
			setStatus(`引用文件失败：${(error as Error).message}`);
		}
	};

	const activeTitle = sessions.find((session) => session.id === activeId)?.title || "新会话";
	const currentContext = modelOption?.currentValue
		? modelContexts[modelOption.currentValue]
		: undefined;
	const { sensitiveHit, setSensitiveHit, send, cancel, retryMessage } = prompt;

	return (
		<div className="omp-app">
			<TitleBar
				sidebarCollapsed={sidebarCollapsed}
				onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
				filterOpen={filterOpen}
				onToggleFilter={() => setFilterOpen((value) => !value)}
				onCloseFilter={() => setFilterOpen(false)}
				filtersActive={filtersActive}
				statusFilter={statusFilter}
				timeFilter={timeFilter}
				onStatusFilter={setStatusFilter}
				onTimeFilter={setTimeFilter}
				onResetFilters={() => {
					setStatusFilter("all");
					setTimeFilter("all");
				}}
				activeTitle={activeTitle}
				connected={connected}
				status={status}
				searchOpen={search.open}
				onToggleSearch={() => (search.open ? search.closeSearch() : search.openSearch())}
				showPreview={docsState.showPreview}
				onTogglePreview={() => docsState.setShowPreview((value) => !value)}
				filterRef={filterRef}
			/>

			<div className="omp-workspace">
				<Sidebar
					collapsed={sidebarCollapsed}
					sessions={filteredSessions}
					activeId={activeId}
					running={running}
					view={sidebarView}
					filtersActive={filtersActive}
					cwd={settings.cwd}
					connected={connected}
					onSelect={(session) => void connection.selectSession(session)}
					onNew={() => void connection.newSession()}
					onOpenSkills={() => setShowSkills(true)}
					onOpenSettings={() => setShowSettings(true)}
					onViewChange={setSidebarView}
				/>

				<main className="omp-main">
					<div className="omp-content">
						<section className="omp-chat">
							{search.open && (
								<div className="omp-searchbar" role="search">
									<Icon name="search" size={15} />
									<input
										ref={search.inputRef}
										autoFocus
										value={search.text}
										onChange={(event) => {
											search.setText(event.target.value);
											search.setIndex(0);
										}}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												event.preventDefault();
												search.jump(event.shiftKey ? -1 : 1);
											}
										}}
										placeholder="搜索对话内容"
										aria-label="搜索对话内容"
									/>
									{search.text && (
										<span className="omp-search-count">
											{search.hitCount ? search.index + 1 : 0}/{search.hitCount}
										</span>
									)}
									<button
										type="button"
										className="omp-search-nav"
										onClick={() => search.jump(-1)}
										disabled={!search.hitCount}
										title="上一处"
										aria-label="上一处搜索结果"
									>
										<Icon name="chevron" size={13} className="omp-search-up" />
									</button>
									<button
										type="button"
										className="omp-search-nav"
										onClick={() => search.jump(1)}
										disabled={!search.hitCount}
										title="下一处"
										aria-label="下一处搜索结果"
									>
										<Icon name="chevron" size={13} />
									</button>
									<button
										type="button"
										className="omp-search-close"
										onClick={search.closeSearch}
										title="关闭搜索"
										aria-label="关闭搜索"
									>
										<Icon name="close" size={13} />
									</button>
								</div>
							)}
							<MessageList
								messages={messages}
								running={running}
								query={search.text.trim()}
								atBottom={scroll.atBottom}
								suggestionsEnabled={settings.homeSuggestions}
								scrollRef={scroll.scrollRef}
								onScroll={scroll.updateAtBottom}
								onScrollToBottom={scroll.scrollToBottom}
								onOpenDoc={docsState.openDoc}
								onRetry={retryMessage}
								onPickHint={composer.insertHint}
							/>

							<Composer
								cwd={settings.cwd}
								connected={connected}
								running={running}
								sendDisabled={!connected || !composer.input.trim()}
								editorRef={composer.editorRef}
								editorHandlers={composer.handlers}
								resourceSuggest={{
									open: composer.resourceSuggest.open,
									menu: {
										label: "引用资源",
										count: composer.resourceSuggest.candidates.length,
										empty: "暂无可引用的文件/网址，可直接粘贴网址或选择本地文件",
										entries: composer.resourceSuggest.candidates.map((candidate) => ({
											key: `${candidate.group}:${candidate.value}`,
											icon:
												candidate.group === "网址" ? (
													<Icon name="link" size={13} />
												) : (
													<Icon name="file" size={13} />
												),
											title: candidate.label,
											detail: `${candidate.group} · ${candidate.detail}`,
										})),
										activeIndex: composer.resourceSuggest.active,
										onHover: composer.resourceSuggest.setActive,
										onSelect: (index) =>
											composer.applyResource(composer.resourceSuggest.candidates[index]),
										footer: {
											icon: "folder",
											label: "从本地选择文件…",
											onSelect: () => {
												composer.resourceSuggest.close();
												void insertFileReference();
											},
										},
									},
								}}
								skillSuggest={{
									open: composer.skillSuggest.open,
									menu: {
										label: "技能",
										count: composer.skillSuggest.items.length,
										empty: "没有匹配的已安装技能",
										entries: composer.skillSuggest.items.map((skill) => ({
											key: skill.name,
											icon: skill.name.slice(0, 1).toUpperCase(),
											title: skill.name,
											detail: skill.description,
										})),
										activeIndex: composer.skillSuggest.active,
										onHover: composer.skillSuggest.setActive,
										onSelect: (index) =>
											composer.applySkill(composer.skillSuggest.items[index].name),
									},
								}}
								entryMenu={{
									open: entryMenuOpen,
									submenu: entrySubmenu,
									onToggleOpen: () => {
										setEntrySubmenu(null);
										setEntryMenuOpen((value) => !value);
									},
									onChangeSubmenu: setEntrySubmenu,
									onClose: closeEntryMenu,
									menuRef: entryMenuRef,
									currentModeName: capabilities.currentModeName,
									modes: activeState?.modes ?? null,
									onSelectMode: (modeId) => void changeMode(modeId),
									skills: composer.installedSkills,
									onSelectSkill: composer.applySkill,
									onManageSkills: () => setShowSkills(true),
									mcpConfig: mcpConfig,
									onInsertFile: () => void insertFileReference(),
									onOpenResourceSuggest: composer.openResourceSuggest,
								}}
								approval={{
									open: approvalOpen,
									mode: settings.approvalMode,
									wrapRef: approvalRef,
									onToggle: () => setApprovalOpen((value) => !value),
									onSelect: (mode) => {
										setApprovalOpen(false);
										void connection.changeApprovalMode(mode);
									},
								}}
								context={{
									open: contextOpen,
									percent: contextPercent,
									report: report,
									shortModelName: shortModelName,
									wrapRef: contextRef,
									onToggle: () => {
										const next = !contextOpen;
										setContextOpen(next);
										if (next && activeId) void probeContext(activeId);
									},
									onClose: () => setContextOpen(false),
								}}
								modelTrigger={{
									name: currentModelName,
									open: modelMenuOpen,
									onToggle: () => {
										setOpenModelRow(null);
										setModelMenuOpen((value) => !value);
									},
								}}
								modelPanel={{
									open: modelMenuOpen,
									modelName: currentModelName,
									modelOption: modelOption ?? null,
									contexts: modelContexts,
									rows: modelRows,
									currentContext: currentContext,
									openRowId: openModelRow,
									onOpenRow: setOpenModelRow,
									onSelectModel: (optionId, value) => void changeConfigOption(optionId, value),
									onOpenSettings: () => {
										setModelMenuOpen(false);
										setShowSettings(true);
									},
								}}
								onSend={() => void send()}
								onCancel={cancel}
							/>
						</section>

						{docsState.showPreview && (
							<PreviewPane
								docs={docsState.docs}
								currentDoc={docsState.currentDoc}
								activeDoc={docsState.activeDoc}
								onSelectDoc={docsState.setActiveDoc}
								onCloseDoc={docsState.closeDoc}
								onReload={() => void docsState.reloadDoc()}
								onOpenFile={() => void docsState.openLocalFile()}
								onClose={() => docsState.setShowPreview(false)}
							/>
						)}
					</div>
				</main>
			</div>

			{sensitiveHit && (
				<SensitiveDialog
					hit={sensitiveHit}
					onCancel={() => setSensitiveHit(null)}
					onConfirm={() => {
						const pending = sensitiveHit;
						setSensitiveHit(null);
						// 与正常发送保持一致：确认发送后清空输入区与 chip
						composer.clear();
						void send(pending.text, true);
					}}
				/>
			)}

			{connection.permission && (
				<PermissionDialog
					request={connection.permission}
					onSelect={(optionId) => {
						connection.permission?.respond({ outcome: { outcome: "selected", optionId } });
						connection.setPermission(null);
					}}
				/>
			)}

			{showSettings && (
				<SettingsPanel
					settings={settings}
					onClose={() => setShowSettings(false)}
					onSave={saveSettings}
				/>
			)}

			{showSkills && (
				<SkillsPanel
					cwd={settings.cwd}
					autoInstallTrustedSkills={settings.autoInstallTrustedSkills}
					onClose={() => setShowSkills(false)}
					onUseSkill={(name) => {
						composer.applySkill(name);
						setShowSkills(false);
					}}
				/>
			)}

			{connection.stderrLog.length > 0 && (
				<details className="omp-logs">
					<summary>
						<Icon name="warning" size={12} /> omp 日志（{connection.stderrLog.length}）
					</summary>
					<pre>{connection.stderrLog.join("")}</pre>
				</details>
			)}
		</div>
	);
}
