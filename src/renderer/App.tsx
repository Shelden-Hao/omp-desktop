import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AcpEvent } from "../shared/protocol";
import type {
	ApprovalMode,
	AuditEntry,
	ChatMessage,
	ContentBlock,
	ContextReport,
	DesktopSettings,
	McpConfigInfo,
	SessionState,
} from "../shared/types";
import { AcpClient, isStaleSessionError, normalizeSessionState } from "./core/acp/client";
import { parseContextReport } from "./core/context-report";
import { Icon } from "./components/common/Icon";
import {
	filterSessions,
	type Session,
	type SidebarView,
	type StatusFilter,
	type TimeFilter,
} from "./core/session-filters";
import { MessageList } from "./components/chat/MessageList";
import { Composer } from "./components/composer/Composer";
import type { EntrySubmenu } from "./components/composer/EntryMenu";
import type { ModelRow } from "./components/composer/ModelPanel";
import { PreviewPane } from "./components/layout/PreviewPane";
import { Sidebar } from "./components/layout/Sidebar";
import { TitleBar } from "./components/layout/TitleBar";
import { PermissionDialog } from "./components/modals/PermissionDialog";
import { SensitiveDialog } from "./components/modals/SensitiveDialog";
import { buildModelRows, readModelCapabilities } from "./core/model-rows";
import { APPROVAL_LABEL } from "./core/labels";
import { detectSensitive } from "./core/security/sensitive";
import {
	appendBlock as reduceAppendBlock,
	appendUserChunk as reduceAppendUserChunk,
	stampDurations,
	updateToolBlock,
} from "./core/session-reducer";
import { extractText, formatToolInput } from "./core/tool-input";
import { useChatDocs } from "./hooks/use-chat-docs";
import { useChatScroll } from "./hooks/use-chat-scroll";
import { useComposerEditor } from "./hooks/use-composer-editor";
import { useDismiss } from "./hooks/use-dismiss";
import { useSessionSearch } from "./hooks/use-session-search";
import { SettingsPanel } from "./panels/settings";
import { SkillsPanel } from "./panels/SkillsPanel";

interface PermissionState {
	sessionId: string;
	title: string;
	options: Array<{ optionId: string; name: string; kind: string }>;
	respond: (result: unknown) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function App() {
	const [client, setClient] = useState<AcpClient | null>(null);
	const [sessions, setSessions] = useState<Session[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({});
	const [running, setRunning] = useState(false);
	const [connected, setConnected] = useState(false);
	const [status, setStatus] = useState("准备连接 omp…");
	const [stderrLog, setStderrLog] = useState<string[]>([]);
	const [showSettings, setShowSettings] = useState(false);
	const [showSkills, setShowSkills] = useState(false);
	const [settings, setSettings] = useState<DesktopSettings>({
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
	});
	const [permission, setPermission] = useState<PermissionState | null>(null);
	/** 敏感信息拦截：命中后暂停发送，等用户确认 */
	const [sensitiveHit, setSensitiveHit] = useState<{ label: string; text: string } | null>(null);
	const [sidebarView, setSidebarView] = useState<SidebarView>("recent");
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
	const [filterOpen, setFilterOpen] = useState(false);
	const [sessionStates, setSessionStates] = useState<Record<string, SessionState>>({});
	const [modelMenuOpen, setModelMenuOpen] = useState(false);
	const [modelContexts, setModelContexts] = useState<Record<string, number>>({});
	const [openModelRow, setOpenModelRow] = useState<string | null>(null);
	const [approvalOpen, setApprovalOpen] = useState(false);
	const [agentEpoch, setAgentEpoch] = useState(0);
	const [contextOpen, setContextOpen] = useState(false);
	const [contextReports, setContextReports] = useState<Record<string, ContextReport>>({});
	const [entryMenuOpen, setEntryMenuOpen] = useState(false);
	const [entrySubmenu, setEntrySubmenu] = useState<EntrySubmenu>(null);
	const [mcpConfig, setMcpConfig] = useState<McpConfigInfo | null>(null);
	const entryMenuRef = useRef<HTMLSpanElement>(null);

	const filterRef = useRef<HTMLSpanElement>(null);
	const clientRef = useRef<AcpClient | null>(null);
	const toolIndex = useRef<Map<string, number>>(new Map());
	const activeIdRef = useRef<string | null>(null);
	const loadedSessions = useRef<Set<string>>(new Set());
	/** 消息镜像：loadSessionHistory 清空前先留一份，omp 回放不出历史时用它兜底 */
	const messagesRef = useRef<Record<string, ChatMessage[]>>({});
	const pendingPermissionRef = useRef<PermissionState | null>(null);
	const cancelledSessionRef = useRef<string | null>(null);
	const runningRef = useRef(false);
	/** 正在静默采集 `/context` 输出时指向该会话，期间的 chunk 不进对话 */
	const silentContextRef = useRef<{ sessionId: string; text: string } | null>(null);
	const contextBusyRef = useRef(false);
	const approvalRef = useRef<HTMLSpanElement>(null);
	const contextRef = useRef<HTMLSpanElement>(null);
	/** handleEvent 是 useCallback，读最新设置要走 ref，避免闭包拿到旧值 */
	const settingsRef = useRef<DesktopSettings | null>(null);

	const messages = useMemo(
		() => (activeId ? messagesBySession[activeId] || [] : []),
		[activeId, messagesBySession],
	);

	// 视图态各自成 hook：输入区、对话内搜索、右侧预览、消息滚动，App 只负责装配
	const docsState = useChatDocs(setStatus);
	const search = useSessionSearch(messages);
	const composer = useComposerEditor({
		docs: docsState.docs,
		messages,
		onSubmit: () => void send(),
	});
	const scroll = useChatScroll({
		activeId,
		messages,
		running,
		permissionOpen: Boolean(permission),
	});
	// 设置候选技能用的是 state setter，本身稳定，单独取出来避免把整个 composer 对象塞进依赖
	const { setInstalledSkills } = composer;

	const filtersActive = statusFilter !== "all" || timeFilter !== "all";
	const report = activeId ? contextReports[activeId] : undefined;
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
		activeIdRef.current = activeId;
	}, [activeId]);

	useEffect(() => {
		pendingPermissionRef.current = permission;
	}, [permission]);

	useEffect(() => {
		settingsRef.current = settings;
	}, [settings]);

	/** 审计日志：只记录客户端真实发生的高风险动作，关闭时静默跳过 */
	const logAudit = useCallback((entry: Partial<AuditEntry>) => {
		if (!settingsRef.current?.auditEnabled) return Promise.resolve();
		return window.desktop.audit.add(entry).catch(() => undefined);
	}, []);

	useEffect(() => {
		runningRef.current = running;
	}, [running]);

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

	const updateMessages = useCallback(
		(sessionId: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
			setMessagesBySession((prev) => ({ ...prev, [sessionId]: updater(prev[sessionId] || []) }));
		},
		[],
	);

	const appendBlock = useCallback(
		(sessionId: string, block: ContentBlock, toolCallId?: string) => {
			updateMessages(sessionId, (prev) => {
				const { messages: next, index } = reduceAppendBlock(prev, block);
				if (toolCallId) toolIndex.current.set(`${sessionId}:${toolCallId}`, index);
				return next;
			});
		},
		[updateMessages],
	);

	const appendUserChunk = useCallback(
		(sessionId: string, text: string) => {
			updateMessages(sessionId, (prev) => reduceAppendUserChunk(prev, text));
		},
		[updateMessages],
	);

	const updateToolStatus = useCallback(
		(
			sessionId: string,
			toolCallId: string,
			next: "completed" | "failed",
			result?: string,
			title?: string,
		) => {
			const index = toolIndex.current.get(`${sessionId}:${toolCallId}`);
			if (index === undefined) return;
			updateMessages(sessionId, (prev) =>
				updateToolBlock(prev, toolCallId, { status: next, result, title }),
			);
		},
		[updateMessages],
	);

	const persistSessions = useCallback(async (next: Session[]) => {
		try {
			const loaded = await window.desktop.settings.get();
			await window.desktop.sessions.set(
				next.map((session) => ({
					id: session.id,
					title: session.title,
					cwd: session.cwd || loaded.cwd,
					ts: session.ts || Date.now(),
				})),
			);
		} catch (error) {
			setStatus(`会话保存失败：${(error as Error).message}`);
		}
	}, []);

	/**
	 * 向当前会话静默发送 `/context`，解析出真实的分段用量。
	 * 命令在 omp 侧是本地执行的，不产生模型请求也不写进 transcript，
	 * 因此可以随时刷新，不会污染对话。
	 */
	const probeContext = useCallback(async (sessionId: string, target?: AcpClient | null) => {
		const acp = target ?? clientRef.current;
		if (!acp || runningRef.current || contextBusyRef.current) return;
		if (silentContextRef.current) return;
		const box = { sessionId, text: "" };
		silentContextRef.current = box;
		contextBusyRef.current = true;
		try {
			await acp.prompt(sessionId, "/context");
		} catch {
			// 旧版 omp 没有 /context 命令时静默失败，面板退化到只显示总量
		} finally {
			if (silentContextRef.current === box) silentContextRef.current = null;
			contextBusyRef.current = false;
		}
		const parsed = parseContextReport(box.text);
		if (parsed) setContextReports((prev) => ({ ...prev, [sessionId]: parsed }));
	}, []);

	const loadSessionHistory = useCallback(async (acp: AcpClient, sessionId: string, cwd: string) => {
		if (loadedSessions.current.has(sessionId)) return;
		loadedSessions.current.add(sessionId);
		const local = messagesRef.current[sessionId] ?? [];
		setMessagesBySession((prev) => ({ ...prev, [sessionId]: [] }));
		try {
			const loaded = await acp.loadSession(sessionId, cwd);
			setSessionStates((prev) => ({ ...prev, [sessionId]: normalizeSessionState(loaded) }));
			// omp 重启后常常回放不出内容，这时宁可显示本地已有的对话，也不要给用户一片空白
			setMessagesBySession((prev) =>
				prev[sessionId]?.length || local.length === 0 ? prev : { ...prev, [sessionId]: local },
			);
		} catch (error) {
			setMessagesBySession((prev) => ({ ...prev, [sessionId]: local }));
			// omp 重启后旧 sessionId 不再存在：历史捞不回来，但会话仍可用（发消息时自动重绑）
			if (isStaleSessionError(error)) {
				setStatus("该会话在 omp 重启前创建，历史无法恢复；发送消息会自动新建会话");
				return;
			}
			setStatus(`恢复会话失败：${(error as Error).message}`);
		}
	}, []);

	const handleEvent = useCallback(
		(event: AcpEvent) => {
			if (event.type === "notification") {
				const params = event.params as Record<string, unknown>;
				if (event.method !== "session/update") return;
				const update = params.update as Record<string, unknown> | undefined;
				if (!update) return;
				const sessionId = (params.sessionId as string) || activeIdRef.current;
				if (!sessionId) return;
				const kind = update.sessionUpdate as string;

				if (kind === "current_mode_update") {
					const modeId = String(update.currentModeId || "");
					setSessionStates((prev) => {
						const current = prev[sessionId] || { modes: null, configOptions: [] };
						return {
							...prev,
							[sessionId]: {
								...current,
								modes: current.modes ? { ...current.modes, currentModeId: modeId } : null,
							},
						};
					});
					return;
				}
				if (kind === "config_option_update") {
					const normalized = normalizeSessionState({ configOptions: update.configOptions });
					setSessionStates((prev) => {
						const current = prev[sessionId] || { modes: null, configOptions: [] };
						return {
							...prev,
							[sessionId]: { ...current, configOptions: normalized.configOptions },
						};
					});
					return;
				}

				if (kind === "usage_update") {
					// omp 每次请求结束推送一次，只有总量，没有分项；分项走 /context 解析
					const size = Number(update.size) || 0;
					const used = Number(update.used) || 0;
					setContextReports((prev) => {
						const current = prev[sessionId];
						if (current) {
							if (!size || size === current.contextWindow) return prev;
							return { ...prev, [sessionId]: { ...current, contextWindow: size } };
						}
						if (!size) return prev;
						return {
							...prev,
							[sessionId]: {
								contextWindow: size,
								usedTokens: used,
								percent: (used / size) * 100,
								parts: [],
								reservedTokens: 0,
							},
						};
					});
					return;
				}

				const content = update.content as { text?: string } | undefined;

				if (kind === "user_message_chunk" && content?.text) {
					// 历史回放会带用户消息；实时 prompt 的用户气泡已本地插入，忽略回声。
					if (!runningRef.current) appendUserChunk(sessionId, content.text);
				} else if (kind === "agent_message_chunk" && content?.text) {
					// /context 是本地命令，输出只用于解析，不写进对话
					const silent = silentContextRef.current;
					if (silent && silent.sessionId === sessionId) {
						silent.text += content.text;
						return;
					}
					appendBlock(sessionId, { type: "text", text: content.text });
				} else if (kind === "agent_thought_chunk" && content?.text) {
					appendBlock(sessionId, { type: "thinking", text: content.text });
				} else if (kind === "tool_call") {
					const toolCallId = update.toolCallId as string;
					const toolTitle = typeof update.title === "string" ? update.title : "";
					const toolKind = typeof update.kind === "string" ? update.kind : "";
					const toolName =
						typeof update.name === "string" && update.name ? update.name : toolKind || "tool";
					appendBlock(
						sessionId,
						{
							type: "tool_call",
							text: toolCallId,
							toolName,
							title: toolTitle,
							kind: toolKind,
							rawInput: formatToolInput(update.rawInput),
							result: extractText(update.content),
							status: "pending",
							raw: update,
						},
						toolCallId,
					);
					// 只记录实时执行的动作：session/load 会回放历史工具调用，不能被当成新事件
					if (runningRef.current) {
						void logAudit({
							category: /bash|shell|exec|terminal/i.test(`${toolName} ${toolKind}`)
								? "命令安全"
								: /read|write|edit|fs|grep|glob/i.test(`${toolName} ${toolKind}`)
									? "文件安全"
									: /fetch|http|web|browser/i.test(`${toolName} ${toolKind}`)
										? "网络访问"
										: "模型行为",
							action: `调用工具 ${toolName}`,
							detail: toolTitle || formatToolInput(update.rawInput).slice(0, 200),
							level: "info",
						});
					}
				} else if (kind === "tool_call_update") {
					const toolCallId = update.toolCallId as string;
					const next = update.status as string;
					const nextTitle = typeof update.title === "string" ? update.title : undefined;
					const result = update.content !== undefined ? extractText(update.content) : undefined;
					if (next === "completed" || next === "failed") {
						updateToolStatus(
							sessionId,
							toolCallId,
							next === "completed" ? "completed" : "failed",
							result,
							nextTitle,
						);
					} else if (nextTitle || result) {
						updateMessages(sessionId, (prev) =>
							updateToolBlock(prev, toolCallId, { title: nextTitle, result }),
						);
					}
				}
				return;
			}

			const params = event.params as Record<string, unknown>;
			if (event.method === "session/request_permission") {
				const toolCall = params.toolCall as { title?: string } | undefined;
				setPermission({
					sessionId: (params.sessionId as string) || "",
					title: toolCall?.title || "请求执行操作",
					options:
						(params.options as Array<{ optionId: string; name: string; kind: string }>) || [],
					respond: event.respond,
				});
				void logAudit({
					category: "权限审批",
					action: "请求确认工具操作",
					detail: toolCall?.title || "",
					level: "warn",
				});
				return;
			}

			const tools = window.desktop.acpTools;
			const runTool = async (task: Promise<{ ok: boolean; result?: unknown; error?: string }>) => {
				try {
					const result = await task;
					if (result.ok) event.respond(result.result ?? {});
					else event.respondError(-32000, result.error || "工具执行失败");
				} catch (error) {
					event.respondError(-32000, (error as Error).message);
				}
			};

			switch (event.method) {
				case "fs/read_text_file":
					void runTool(tools.fsRead(params));
					break;
				case "fs/write_text_file":
					void runTool(tools.fsWrite(params));
					break;
				case "terminal/create":
					void runTool(tools.terminalCreate(params));
					break;
				case "terminal/output":
					void runTool(tools.terminalOutput(params));
					break;
				case "terminal/wait_for_exit":
					void runTool(tools.terminalWait(params));
					break;
				case "terminal/kill":
					void runTool(tools.terminalKill(params));
					break;
				case "terminal/release":
					void runTool(tools.terminalRelease(params));
					break;
				default:
					event.respond({});
			}
		},
		[appendBlock, appendUserChunk, updateToolStatus, updateMessages, logAudit],
	);

	useEffect(() => {
		const bridge = window.desktop;
		if (!bridge) {
			setStatus("错误：preload 未注入");
			return;
		}

		bridge.settings.get().then((loaded) => setSettings(loaded));
		bridge.onStderr((text) => setStderrLog((prev) => [...prev.slice(-80), text]));
		bridge.onExit(() => {
			setConnected(false);
			setRunning(false);
			setStatus("omp 已退出");
		});

		const acp = new AcpClient(bridge);
		acp.onEvent(handleEvent);
		clientRef.current = acp;
		setClient(acp);
		// 进程重启后会话需要重新 load，历史也要重新回放
		loadedSessions.current.clear();

		(async () => {
			const started = await acp.start();
			if (!started.ok) {
				setStatus(`启动失败：${started.error}`);
				return;
			}
			setStatus("握手中…");
			try {
				await acp.initialize();
				const loaded = await bridge.settings.get();
				const stored = await bridge.sessions.get();
				let list: Session[] = stored.map((session) => ({
					id: session.id,
					title: session.title,
					cwd: session.cwd || loaded.cwd,
					ts: session.ts,
				}));

				try {
					const remote = await acp.listSessions();
					for (const session of remote.sessions || []) {
						if (!list.some((item) => item.id === session.sessionId)) {
							list.push({
								id: session.sessionId,
								title: session.title || `会话 ${list.length + 1}`,
								cwd: session.cwd || loaded.cwd,
								ts: Date.now(),
							});
						}
					}
				} catch {
					// 某些 omp 版本没有 session/list，忽略即可。
				}

				if (list.length === 0) {
					const session = await acp.newSession(loaded.cwd);
					list = [{ id: session.sessionId, title: "会话 1", cwd: loaded.cwd, ts: Date.now() }];
					loadedSessions.current.add(session.sessionId);
					setSessionStates((prev) => ({
						...prev,
						[session.sessionId]: normalizeSessionState(session),
					}));
				}

				setSessions(list);
				void persistSessions(list);
				// 切换安全等级会重启进程，优先回到用户原先正在看的会话
				const previous = activeIdRef.current;
				const first = (previous && list.find((item) => item.id === previous)) || list[0];
				setActiveId(first.id);
				setConnected(true);
				setStatus("已连接");
				await loadSessionHistory(acp, first.id, first.cwd || loaded.cwd);
				void probeContext(first.id, acp);
			} catch (error) {
				setStatus(`握手失败：${(error as Error).message}`);
			}
		})();

		return () => acp.stop();
	}, [agentEpoch, handleEvent, loadSessionHistory, persistSessions, probeContext]);

	// 切换会话（含启动、新建）默认从底部看起；必须在布局阶段重置，否则本次提交的跟随判断会用到旧值
	useLayoutEffect(() => {
		messagesRef.current = messagesBySession;
	}, [messagesBySession]);

	/**
	 * 把界面上的会话绑到 omp 里新建的 session 上。
	 * omp 重启后旧 sessionId 会失效，直接报错会让用户「没法对话」，这里保留标题与本地消息，
	 * 只把 id 换掉，后续请求走新 session。
	 */
	const rebindSession = async (acp: AcpClient, oldId: string, cwd: string) => {
		const created = await acp.newSession(cwd);
		const newId = created.sessionId;
		const nextSessions = sessions.map((item) =>
			item.id === oldId ? { ...item, id: newId } : item,
		);
		setSessions(nextSessions);
		void persistSessions(nextSessions);
		setSessionStates((prev) => ({ ...prev, [newId]: normalizeSessionState(created) }));
		setMessagesBySession((prev) => {
			const next = { ...prev };
			next[newId] = next[oldId] ?? [];
			delete next[oldId];
			return next;
		});
		loadedSessions.current.add(newId);
		setActiveId(newId);
		return newId;
	};

	const send = async (override?: string, confirmed = false) => {
		// inline chip 已在 readEditorText 里还原成 omp 认识的 /skill:<name>；重试走 override 不再读输入区
		const text = (override ?? composer.readText()).trim();
		// 正在刷新上下文用量时先让出，避免两个 prompt 并发打到同一会话
		if (!client || !activeId || !text || running || contextBusyRef.current) return;
		if (!confirmed && settings.sensitiveGuard) {
			const hit = detectSensitive(text);
			if (hit) {
				setSensitiveHit({ label: hit, text });
				void logAudit({
					category: "敏感保护",
					action: "发送前拦截疑似敏感信息",
					detail: hit,
					level: "block",
				});
				return;
			}
		}
		const sessionId = activeId;
		const startedAt = Date.now();
		const userMessageId = uid();
		if (override === undefined) composer.clear();
		composer.skillSuggest.close();
		composer.resourceSuggest.close();
		scroll.stickToBottom();
		updateMessages(sessionId, (prev) => [
			...prev,
			{ id: userMessageId, role: "user", blocks: [{ type: "text", text }], ts: startedAt },
		]);
		runningRef.current = true;
		setRunning(true);
		const sessionCwd = sessions.find((item) => item.id === sessionId)?.cwd || settings.cwd;
		// omp 重启后这个会话可能已失效，绑定 id 跟着重绑结果走，消息落到真正发出请求的会话上
		let boundId = sessionId;
		try {
			try {
				await client.prompt(boundId, text);
			} catch (error) {
				if (!isStaleSessionError(error)) throw error;
				setStatus("原会话在 omp 重启后失效，已新建会话继续");
				boundId = await rebindSession(client, sessionId, sessionCwd);
				await client.prompt(boundId, text);
			}
		} catch (error) {
			if (cancelledSessionRef.current === sessionId) {
				cancelledSessionRef.current = null;
				return;
			}
			updateMessages(boundId, (prev) => [
				...prev,
				{
					id: uid(),
					role: "system",
					blocks: [{ type: "text", text: `请求失败：${(error as Error).message}` }],
					ts: Date.now(),
				},
			]);
		} finally {
			if (cancelledSessionRef.current === sessionId) cancelledSessionRef.current = null;
			updateMessages(boundId, (prev) => stampDurations(prev, userMessageId));
			runningRef.current = false;
			setRunning(false);
			composer.focus();
			// 一轮结束后刷新上下文占用（工具输出、消息都会变化）
			void probeContext(boundId);
		}
	};

	const retryMessage = (message: ChatMessage) => {
		const text = message.blocks
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("\n")
			.trim();
		if (text) void send(text);
	};

	const cancel = () => {
		if (!client || !activeId) return;
		cancelledSessionRef.current = activeId;
		client.cancel(activeId);
		const pending = pendingPermissionRef.current;
		if (pending?.sessionId === activeId) {
			pending.respond({ outcome: { outcome: "cancelled" } });
			setPermission(null);
		}
		runningRef.current = false;
		setRunning(false);
	};

	const selectSession = async (session: Session) => {
		setActiveId(session.id);
		setRunning(false);
		if (client && !loadedSessions.current.has(session.id)) {
			const loaded = await window.desktop.settings.get();
			await loadSessionHistory(client, session.id, session.cwd || loaded.cwd);
			void probeContext(session.id, client);
		}
	};

	/** 切换安全等级：omp 只接受启动参数，因此要重启 ACP 进程并恢复当前会话 */
	const changeApprovalMode = async (mode: ApprovalMode) => {
		setApprovalOpen(false);
		if (mode === settings.approvalMode) return;
		if (running) {
			setStatus("任务运行中，结束后再切换安全等级");
			return;
		}
		setSettings((prev) => ({ ...prev, approvalMode: mode }));
		try {
			await window.desktop.settings.set({ approvalMode: mode });
		} catch (error) {
			setStatus(`安全等级保存失败：${(error as Error).message}`);
			return;
		}
		setStatus(`安全等级已切换为「${APPROVAL_LABEL[mode]}」，正在重连 omp…`);
		setConnected(false);
		setAgentEpoch((value) => value + 1);
	};

	const newSession = async () => {
		if (!client) return;
		try {
			const loaded = await window.desktop.settings.get();
			const session = await client.newSession(loaded.cwd);
			const next: Session[] = [
				...sessions,
				{
					id: session.sessionId,
					title: `会话 ${sessions.length + 1}`,
					cwd: loaded.cwd,
					ts: Date.now(),
				},
			];
			loadedSessions.current.add(session.sessionId);
			setSessionStates((prev) => ({
				...prev,
				[session.sessionId]: normalizeSessionState(session),
			}));
			setSessions(next);
			void persistSessions(next);
			// 空会话在筛选里算「规划中」，所以显式登记空消息列表
			setMessagesBySession((prev) => ({ ...prev, [session.sessionId]: [] }));
			setActiveId(session.sessionId);
			setRunning(false);
		} catch (error) {
			setStatus(`新建会话失败：${(error as Error).message}`);
		}
	};

	const changeMode = async (modeId: string) => {
		if (!client || !activeId) return;
		try {
			await client.setMode(activeId, modeId);
			setSessionStates((prev) => {
				const current = prev[activeId] || { modes: null, configOptions: [] };
				return {
					...prev,
					[activeId]: {
						...current,
						modes: current.modes ? { ...current.modes, currentModeId: modeId } : null,
					},
				};
			});
		} catch (error) {
			setStatus(`切换档位失败：${(error as Error).message}`);
		}
	};

	const changeConfigOption = async (optionId: string, value: string | boolean) => {
		if (!client || !activeId) return;
		try {
			await client.setConfigOption(activeId, optionId, value);
			setSessionStates((prev) => {
				const current = prev[activeId] || { modes: null, configOptions: [] };
				return {
					...prev,
					[activeId]: {
						...current,
						configOptions: current.configOptions.map((option) =>
							option.id === optionId
								? {
										...option,
										currentValue: typeof value === "string" ? value : option.currentValue,
										currentBoolean: typeof value === "boolean" ? value : option.currentBoolean,
									}
								: option,
						),
					},
				};
			});
		} catch (error) {
			setStatus(`切换配置失败：${(error as Error).message}`);
		}
	};

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
	const activeState = activeId ? sessionStates[activeId] : undefined;
	const capabilities = readModelCapabilities(activeState);
	const { modelOption, currentModelName, shortModelName } = capabilities;

	// 模型详情面板只列模型相关能力；运行模式已移到输入区的「添加」聚合菜单
	const modelRows: ModelRow[] = buildModelRows(capabilities).map((row) => ({
		id: row.id,
		label: row.label,
		valueLabel: row.valueLabel,
		currentValue: row.currentValue,
		options: row.options,
		onSelect: (value) =>
			void changeConfigOption(row.id, row.toggle ? (row.toggleNext ?? value) : value),
	}));
	const currentContext = modelOption?.currentValue
		? modelContexts[modelOption.currentValue]
		: undefined;

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
					onSelect={(session) => void selectSession(session)}
					onNew={() => void newSession()}
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
									onSelect: (mode) => void changeApprovalMode(mode),
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

			{permission && (
				<PermissionDialog
					request={permission}
					onSelect={(optionId) => {
						permission.respond({ outcome: { outcome: "selected", optionId } });
						setPermission(null);
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

			{stderrLog.length > 0 && (
				<details className="omp-logs">
					<summary>
						<Icon name="warning" size={12} /> omp 日志（{stderrLog.length}）
					</summary>
					<pre>{stderrLog.join("")}</pre>
				</details>
			)}
		</div>
	);
}
