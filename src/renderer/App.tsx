import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
	FormEvent as ReactFormEvent,
	KeyboardEvent as ReactKeyboardEvent,
	MouseEvent as ReactMouseEvent,
} from "react";
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
	SkillSummary,
} from "../shared/types";
import { AcpClient, normalizeSessionState } from "./core/acp/client";
import {
	chipBeforeCaret,
	chipFromEventTarget,
	focusEditor,
	getEditorRange,
	insertResourceChip,
	insertSkillChip,
	insertTextAtCursor,
	readDraft,
	readEditorText,
	readSkillChips,
	removeChip,
} from "./core/composer/editor";
import { parseContextReport } from "./core/context-report";
import { Icon } from "./components/common/Icon";
import {
	type Session,
	type SidebarView,
	type StatusFilter,
	type TimeFilter,
} from "./core/session-filters";
import { Block } from "./components/chat/ContentBlock";
import { MessageActions } from "./components/chat/MessageActions";
import { ApprovalMenu } from "./components/composer/ApprovalMenu";
import { ContextPanel } from "./components/composer/ContextPanel";
import { EntryMenu, type EntrySubmenu } from "./components/composer/EntryMenu";
import { type ModelRow, ModelPanel } from "./components/composer/ModelPanel";
import { SuggestMenu } from "./components/composer/SuggestMenu";
import { PreviewPane } from "./components/layout/PreviewPane";
import { Sidebar } from "./components/layout/Sidebar";
import { TitleBar } from "./components/layout/TitleBar";
import { PermissionDialog } from "./components/modals/PermissionDialog";
import { SensitiveDialog } from "./components/modals/SensitiveDialog";
import { DEFAULT_DOCS, type DocFile } from "./core/docs";
import { formatDuration, pickLabel, shortPath } from "./core/format";
import { APPROVAL_LABEL, THINKING_LABEL } from "./core/labels";
import {
	extractPathsFromMessages,
	extractUrlsFromMessages,
	urlLabel,
	type ResourceCandidate,
} from "./core/resources";
import { detectSensitive } from "./core/security/sensitive";
import { extractText, formatToolInput } from "./core/tool-input";
import { SettingsPanel } from "./panels/SettingsPanel";
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
	const [input, setInput] = useState("");
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
	const [docs, setDocs] = useState<DocFile[]>(DEFAULT_DOCS);
	const [activeDoc, setActiveDoc] = useState<string | null>(null);
	const [showPreview, setShowPreview] = useState(true);
	const [sidebarView, setSidebarView] = useState<SidebarView>("recent");
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
	const [filterOpen, setFilterOpen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchText, setSearchText] = useState("");
	const [searchIndex, setSearchIndex] = useState(0);
	const [searchHitCount, setSearchHitCount] = useState(0);
	const [atBottom, setAtBottom] = useState(true);
	const [sessionStates, setSessionStates] = useState<Record<string, SessionState>>({});
	const [modelMenuOpen, setModelMenuOpen] = useState(false);
	const [modelContexts, setModelContexts] = useState<Record<string, number>>({});
	const [openModelRow, setOpenModelRow] = useState<string | null>(null);
	const [approvalOpen, setApprovalOpen] = useState(false);
	const [agentEpoch, setAgentEpoch] = useState(0);
	const [contextOpen, setContextOpen] = useState(false);
	const [contextReports, setContextReports] = useState<Record<string, ContextReport>>({});
	const [skillChips, setSkillChips] = useState<string[]>([]);
	const [skillSuggestOpen, setSkillSuggestOpen] = useState(false);
	const [skillQuery, setSkillQuery] = useState("");
	const [skillActive, setSkillActive] = useState(0);
	const [installedSkills, setInstalledSkills] = useState<SkillSummary[]>([]);
	const [resourceSuggestOpen, setResourceSuggestOpen] = useState(false);
	const [resourceQuery, setResourceQuery] = useState("");
	const [resourceActive, setResourceActive] = useState(0);
	const [entryMenuOpen, setEntryMenuOpen] = useState(false);
	const [entrySubmenu, setEntrySubmenu] = useState<EntrySubmenu>(null);
	const [mcpConfig, setMcpConfig] = useState<McpConfigInfo | null>(null);
	const entryMenuRef = useRef<HTMLSpanElement>(null);

	const scrollRef = useRef<HTMLDivElement>(null);
	/** 输入框是非受控 contenteditable：DOM 是内容真相源，React state 只做镜像用于按钮/联想 */
	const editorRef = useRef<HTMLDivElement>(null);
	const composingRef = useRef(false);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const filterRef = useRef<HTMLSpanElement>(null);
	const clientRef = useRef<AcpClient | null>(null);
	const toolIndex = useRef<Map<string, number>>(new Map());
	const activeIdRef = useRef<string | null>(null);
	const loadedSessions = useRef<Set<string>>(new Set());
	const pendingPermissionRef = useRef<PermissionState | null>(null);
	const cancelledSessionRef = useRef<string | null>(null);
	const runningRef = useRef(false);
	const atBottomRef = useRef(true);
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
	const visibleMessages = messages;

	// 每次打开联想都重新读 omp 技能列表，这样面板里新装/卸载的技能即刻生效
	useEffect(() => {
		if (!skillSuggestOpen) return;
		let cancelled = false;
		void window.desktop.skills.list().then((reply) => {
			if (!cancelled && reply.ok && reply.data) setInstalledSkills(reply.data.skills);
		});
		return () => {
			cancelled = true;
		};
	}, [skillSuggestOpen]);

	const skillSuggestions = useMemo(() => {
		const query = skillQuery.trim().toLowerCase();
		const matched = query
			? installedSkills.filter(
					(skill) =>
						skill.name.toLowerCase().includes(query) ||
						skill.description.toLowerCase().includes(query),
				)
			: installedSkills;
		return matched.filter((skill) => !skillChips.includes(skill.name)).slice(0, 8);
	}, [installedSkills, skillQuery, skillChips]);

	// @ 联想候选全部来自真实数据：已打开文档、本会话工具调用出现过的路径、本会话出现过的网址、用户键入的网址
	const resourceCandidates = useMemo<ResourceCandidate[]>(() => {
		const query = resourceQuery.trim().toLowerCase();
		const list: ResourceCandidate[] = [];
		for (const doc of docs) {
			if (!doc.path) continue;
			list.push({
				value: doc.path.includes(" ") ? `@"${doc.path}"` : `@${doc.path}`,
				label: doc.name,
				group: "对话中的文件",
				detail: doc.path,
			});
		}
		for (const path of extractPathsFromMessages(messages)) {
			list.push({
				value: path.includes(" ") ? `@"${path}"` : `@${path}`,
				label: path.split(/[\\/]/).pop() || path,
				group: "对话中的资源",
				detail: path,
			});
		}
		const typed = resourceQuery.trim();
		if (/^https?:\/\/\S+\.\S+/.test(typed)) {
			list.push({ value: typed, label: urlLabel(typed), group: "网址", detail: typed });
		}
		for (const url of extractUrlsFromMessages(messages)) {
			list.push({ value: url, label: urlLabel(url), group: "网址", detail: url });
		}
		// 同一路径可能同时出现在文档和工具调用里，只保留首次出现的分组
		const seen = new Set<string>();
		const unique = list.filter((item) => {
			if (seen.has(item.value)) return false;
			seen.add(item.value);
			return true;
		});
		return (
			query
				? unique.filter(
						(item) =>
							item.label.toLowerCase().includes(query) || item.detail.toLowerCase().includes(query),
					)
				: unique
		).slice(0, 12);
	}, [docs, messages, resourceQuery]);

	const currentDoc = docs.find((doc) => doc.key === activeDoc);
	const filtersActive = statusFilter !== "all" || timeFilter !== "all";
	const report = activeId ? contextReports[activeId] : undefined;
	const contextPercent = report ? Math.min(100, Math.max(0, report.percent)) : 0;

	// omp 不返回任务状态，这里按本地会话数据推导，避免展示没有依据的状态
	const filteredSessions = useMemo(() => {
		const now = Date.now();
		const startOfToday = new Date(now);
		startOfToday.setHours(0, 0, 0, 0);

		const matchTime = (ts?: number) => {
			if (timeFilter === "all") return true;
			if (!ts) return false;
			if (timeFilter === "today") return ts >= startOfToday.getTime();
			if (timeFilter === "week") return ts >= now - 7 * 86_400_000;
			return ts >= now - 30 * 86_400_000;
		};

		const statusOf = (session: Session): StatusFilter => {
			if (running && session.id === activeId) return "running";
			const list = messagesBySession[session.id];
			// 未打开过的历史会话没有本地缓存，按已完成处理
			if (!list) return "done";
			if (!list.length) return "planned";
			const last = list[list.length - 1];
			if (last.role === "system") return "failed";
			if (last.role === "user") return "pending";
			return "done";
		};

		return sessions.filter(
			(session) =>
				matchTime(session.ts) && (statusFilter === "all" || statusOf(session) === statusFilter),
		);
	}, [sessions, statusFilter, timeFilter, messagesBySession, running, activeId]);

	useEffect(() => {
		if (!filterOpen) return;
		const onPointerDown = (event: MouseEvent) => {
			if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setFilterOpen(false);
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [filterOpen]);

	// 安全等级下拉与上下文面板：点击外部或 Esc 关闭
	useEffect(() => {
		if (!approvalOpen && !contextOpen) return;
		const onPointerDown = (event: MouseEvent) => {
			const target = event.target as Node;
			if (approvalOpen && !approvalRef.current?.contains(target)) setApprovalOpen(false);
			if (contextOpen && !contextRef.current?.contains(target)) setContextOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setApprovalOpen(false);
			setContextOpen(false);
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [approvalOpen, contextOpen]);

	// 聚合入口：点击外部或 Esc 关闭；打开时刷新技能与 MCP 配置
	useEffect(() => {
		if (!entryMenuOpen) return;
		const onPointerDown = (event: MouseEvent) => {
			if (!entryMenuRef.current?.contains(event.target as Node)) {
				setEntryMenuOpen(false);
				setEntrySubmenu(null);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setEntryMenuOpen(false);
				setEntrySubmenu(null);
			}
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		void window.desktop.skills.list().then((reply) => {
			if (reply.ok && reply.data) setInstalledSkills(reply.data.skills);
		});
		void window.desktop.mcp
			.list()
			.then(setMcpConfig)
			.catch(() => setMcpConfig(null));
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [entryMenuOpen]);

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

	useEffect(() => {
		if (!modelMenuOpen) return;
		const onPointerDown = (event: MouseEvent) => {
			const target = event.target as HTMLElement | null;
			if (target?.closest(".omp-model-panel") || target?.closest(".omp-model-trigger")) return;
			setModelMenuOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setModelMenuOpen(false);
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [modelMenuOpen]);

	const updateAtBottom = () => {
		const el = scrollRef.current;
		if (!el) return;
		const next = el.scrollHeight - el.scrollTop - el.clientHeight <= 24;
		atBottomRef.current = next;
		setAtBottom(next);
	};

	const scrollToBottom = () => {
		const el = scrollRef.current;
		if (!el) return;
		// 不用 smooth：动画中间帧会触发 onScroll，把尚未到底的瞬间误判成用户离开了底部
		el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
		atBottomRef.current = true;
		setAtBottom(true);
	};

	const jumpSearch = (delta: number) => {
		if (!searchHitCount) return;
		setSearchIndex((current) => (current + delta + searchHitCount) % searchHitCount);
	};

	useEffect(() => {
		if (!searchOpen || !searchText.trim()) {
			setSearchHitCount(0);
			return;
		}
		const marks = document.querySelectorAll("mark[data-search-hit]");
		setSearchHitCount(marks.length);
		setSearchIndex((current) => (marks.length ? current % marks.length : 0));
	}, [searchOpen, searchText, messages]);

	useEffect(() => {
		const marks = Array.from(document.querySelectorAll<HTMLElement>("mark[data-search-hit]"));
		marks.forEach((mark) => mark.classList.remove("omp-search-hit-active"));
		if (!searchOpen || !searchText.trim() || !marks.length) return;
		const active = marks[searchIndex % marks.length];
		active.classList.add("omp-search-hit-active");
		const fold = active.closest("details.omp-process-fold");
		if (fold) fold.setAttribute("open", "");
		requestAnimationFrame(() => {
			active.scrollIntoView({ block: "center", behavior: "smooth" });
		});
	}, [searchOpen, searchText, searchIndex, searchHitCount]);

	useEffect(() => {
		activeIdRef.current = activeId;
	}, [activeId]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
				event.preventDefault();
				setSearchOpen(true);
				requestAnimationFrame(() => {
					searchInputRef.current?.focus();
					searchInputRef.current?.select();
				});
			} else if (event.key === "Escape" && searchOpen) {
				setSearchOpen(false);
				setSearchText("");
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [searchOpen]);

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

	// ---------- 非受控 contenteditable 输入区 ----------
	// DOM 操作全部在 core/composer/editor.ts；这里只负责把 DOM 结果同步到 React state。
	const editor = {
		text: () => readEditorText(editorRef.current),
		chips: () => readSkillChips(editorRef.current),
		range: () => getEditorRange(editorRef.current),
		focus: () => focusEditor(editorRef.current),
		insertText: (text: string) => insertTextAtCursor(editorRef.current, text),
		insertSkill: (name: string) => insertSkillChip(editorRef.current, name),
		insertResource: (candidate: ResourceCandidate) =>
			insertResourceChip(editorRef.current, candidate),
		remove: (chip: HTMLElement) => removeChip(editorRef.current, chip),
		clear: () => {
			if (editorRef.current) editorRef.current.innerHTML = "";
		},
	};

	const syncFromEditor = () => {
		setInput(editor.text());
		setSkillChips(editor.chips());
	};

	const applyResource = (candidate: ResourceCandidate) => {
		editor.insertResource(candidate);
		setResourceSuggestOpen(false);
		setResourceQuery("");
		syncFromEditor();
		editor.focus();
	};

	const onEditorInput = () => {
		if (composingRef.current) return;
		syncFromEditor();
		const draft = readDraft(editor.range());
		// @ 优先：@ 里可能出现的 / 不应被当成技能指令
		setResourceSuggestOpen(draft.resource !== null);
		setResourceQuery(draft.resource ?? "");
		setResourceActive(0);
		setSkillSuggestOpen(draft.skill !== null);
		setSkillQuery(draft.skill ?? "");
		setSkillActive(0);
	};

	const onEditorBeforeInput = (event: ReactFormEvent<HTMLDivElement>) => {
		// 换行统一写成文本节点里的 \n，配合 white-space: pre-wrap；避免出现 div/br 打乱序列化
		const inputType = (event.nativeEvent as InputEvent).inputType;
		if (inputType === "insertParagraph" || inputType === "insertLineBreak") {
			event.preventDefault();
			editor.insertText("\n");
			syncFromEditor();
		}
	};

	const onEditorMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
		const chip = chipFromEventTarget(event.target as HTMLElement);
		if (!chip) return;
		event.preventDefault();
		editor.remove(chip);
		syncFromEditor();
	};

	const onEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (resourceSuggestOpen && resourceCandidates.length > 0) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setResourceActive((current) => (current + 1) % resourceCandidates.length);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setResourceActive(
					(current) => (current - 1 + resourceCandidates.length) % resourceCandidates.length,
				);
				return;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				event.preventDefault();
				const chosen = resourceCandidates[resourceActive];
				if (chosen) applyResource(chosen);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setResourceSuggestOpen(false);
				return;
			}
		}
		if (skillSuggestOpen && skillSuggestions.length > 0) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setSkillActive((current) => (current + 1) % skillSuggestions.length);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setSkillActive(
					(current) => (current - 1 + skillSuggestions.length) % skillSuggestions.length,
				);
				return;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				event.preventDefault();
				const chosen = skillSuggestions[skillActive];
				if (chosen) applySkill(chosen.name);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setSkillSuggestOpen(false);
				return;
			}
		}
		if (event.key === "Backspace") {
			const range = editor.range();
			const hit = range ? chipBeforeCaret(range) : null;
			if (hit) {
				event.preventDefault();
				if (hit.blank) hit.blank.parentNode?.removeChild(hit.blank);
				editor.remove(hit.chip);
				syncFromEditor();
				return;
			}
		}
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			void send();
		}
	};

	const updateMessages = useCallback(
		(sessionId: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
			setMessagesBySession((prev) => ({ ...prev, [sessionId]: updater(prev[sessionId] || []) }));
		},
		[],
	);

	const appendBlock = useCallback(
		(sessionId: string, block: ContentBlock, toolCallId?: string) => {
			updateMessages(sessionId, (prev) => {
				const copy = [...prev];
				let index = copy.length - 1;
				if (index < 0 || copy[index].role !== "agent") {
					copy.push({ id: uid(), role: "agent", blocks: [], ts: Date.now() });
					index = copy.length - 1;
				}
				const message = copy[index];
				const blocks = [...message.blocks];
				const last = blocks[blocks.length - 1];
				const canMergeText =
					!toolCallId &&
					last &&
					last.type === block.type &&
					(block.type === "text" || block.type === "thinking");
				if (canMergeText) {
					blocks[blocks.length - 1] = { ...last, text: last.text + block.text };
				} else {
					blocks.push(block);
				}
				copy[index] = { ...message, blocks };
				if (toolCallId) toolIndex.current.set(`${sessionId}:${toolCallId}`, index);
				return copy;
			});
		},
		[updateMessages],
	);

	const appendUserChunk = useCallback(
		(sessionId: string, text: string) => {
			updateMessages(sessionId, (prev) => {
				const copy = [...prev];
				const last = copy[copy.length - 1];
				if (last?.role === "user") {
					const blocks = [...last.blocks];
					const tail = blocks[blocks.length - 1];
					if (tail?.type === "text") {
						blocks[blocks.length - 1] = { ...tail, text: tail.text + text };
					} else {
						blocks.push({ type: "text", text });
					}
					copy[copy.length - 1] = { ...last, blocks };
					return copy;
				}
				copy.push({ id: uid(), role: "user", blocks: [{ type: "text", text }], ts: Date.now() });
				return copy;
			});
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
			updateMessages(sessionId, (prev) => {
				const copy = [...prev];
				const message = copy[index];
				if (!message) return prev;
				copy[index] = {
					...message,
					blocks: message.blocks.map((block) =>
						block.type === "tool_call" && block.text === toolCallId
							? {
									...block,
									status: next,
									result: result || block.result,
									title: title || block.title,
								}
							: block,
					),
				};
				return copy;
			});
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
		setMessagesBySession((prev) => ({ ...prev, [sessionId]: [] }));
		try {
			const loaded = await acp.loadSession(sessionId, cwd);
			setSessionStates((prev) => ({ ...prev, [sessionId]: normalizeSessionState(loaded) }));
		} catch (error) {
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
						updateMessages(sessionId, (prev) => {
							const copy = [...prev];
							for (const message of copy) {
								const idx = message.blocks.findIndex(
									(b) => b.type === "tool_call" && b.text === toolCallId,
								);
								if (idx < 0) continue;
								const block = message.blocks[idx];
								message.blocks[idx] = {
									...block,
									title: nextTitle || block.title,
									result: result || block.result,
								};
								break;
							}
							return copy;
						});
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
		atBottomRef.current = true;
		setAtBottom(true);
	}, [activeId]);

	useLayoutEffect(() => {
		if (!atBottomRef.current) return;
		const el = scrollRef.current;
		if (!el) return;
		// 跟随 messages 引用而非 length：流式文本是原地追加到同一个 agent 消息里的，长度不变
		el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
	}, [messages, permission, running, logAudit]);

	const send = async (override?: string, confirmed = false) => {
		// inline chip 已在 readEditorText 里还原成 omp 认识的 /skill:<name>；重试走 override 不再读输入区
		const text = (override ?? editor.text()).trim();
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
		if (override === undefined && editorRef.current) editorRef.current.innerHTML = "";
		setInput("");
		setSkillChips([]);
		setSkillSuggestOpen(false);
		setResourceSuggestOpen(false);
		setResourceQuery("");
		atBottomRef.current = true;
		setAtBottom(true);
		updateMessages(sessionId, (prev) => [
			...prev,
			{ id: userMessageId, role: "user", blocks: [{ type: "text", text }], ts: startedAt },
		]);
		runningRef.current = true;
		setRunning(true);
		try {
			await client.prompt(sessionId, text);
		} catch (error) {
			if (cancelledSessionRef.current === sessionId) {
				cancelledSessionRef.current = null;
				return;
			}
			updateMessages(sessionId, (prev) => [
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
			updateMessages(sessionId, (prev) => {
				const now = Date.now();
				const copy = prev.map((item) =>
					item.id === userMessageId ? { ...item, durationMs: now - startedAt } : item,
				);
				for (let i = copy.length - 1; i >= 0; i -= 1) {
					if (copy[i].role === "agent") {
						copy[i] = { ...copy[i], durationMs: now - copy[i].ts };
						break;
					}
				}
				return copy;
			});
			runningRef.current = false;
			setRunning(false);
			editor.focus();
			// 一轮结束后刷新上下文占用（工具输出、消息都会变化）
			void probeContext(sessionId);
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

	const openDoc = (name: string, content: string, path?: string, language?: string) => {
		const key = path || `snippet:${uid()}`;
		setDocs((prev) => [
			...prev.filter((doc) => doc.key !== key),
			{ key, name, content, path, language },
		]);
		setActiveDoc(key);
		setShowPreview(true);
	};

	const openLocalFile = async () => {
		try {
			const file = await window.desktop.files.open();
			if (!file) return;
			openDoc(file.name, file.content, file.path, file.language);
		} catch (error) {
			setStatus(`打开文件失败：${(error as Error).message}`);
		}
	};

	const insertFileReference = async () => {
		try {
			const file = await window.desktop.files.open();
			if (!file) return;
			applyResource({
				value: file.path.includes(" ") ? `@"${file.path}"` : `@${file.path}`,
				label: file.name,
				group: "对话中的文件",
				detail: file.path,
			});
		} catch (error) {
			setStatus(`引用文件失败：${(error as Error).message}`);
		}
	};

	const applySkill = (name: string) => {
		if (!editor.range()) editor.focus();
		editor.insertSkill(name);
		setSkillSuggestOpen(false);
		setSkillQuery("");
		syncFromEditor();
		editor.focus();
	};

	const openResourceSuggest = () => {
		if (!editor.range()) editor.focus();
		editor.insertText("@");
		onEditorInput();
		editor.focus();
	};

	const reloadDoc = async () => {
		if (!currentDoc?.path) return;
		try {
			const file = await window.desktop.files.read(currentDoc.path);
			setDocs((prev) =>
				prev.map((doc) =>
					doc.key === currentDoc.key
						? { ...doc, content: file.content, language: file.language }
						: doc,
				),
			);
		} catch (error) {
			setStatus(`刷新文件失败：${(error as Error).message}`);
		}
	};

	const closeDoc = (key: string) => {
		setDocs((prev) => {
			const next = prev.filter((doc) => doc.key !== key);
			if (activeDoc === key) setActiveDoc(next[0]?.key || null);
			return next;
		});
	};

	const activeTitle = sessions.find((session) => session.id === activeId)?.title || "新会话";
	const activeState = activeId ? sessionStates[activeId] : undefined;
	const modelOption = activeState?.configOptions.find(
		(option) =>
			option.category === "model" ||
			(!option.category &&
				option.options?.some((item) => /gpt|claude|glm|kimi|qwen|deepseek|model/i.test(item.name))),
	);
	const thoughtOption = activeState?.configOptions.find(
		(option) => option.category === "thought_level",
	);
	const otherSelects =
		activeState?.configOptions.filter(
			(option) =>
				option.id !== modelOption?.id &&
				option.id !== thoughtOption?.id &&
				option.category !== "mode",
		) || [];
	const currentModeName = activeState?.modes?.availableModes.find(
		(mode) => mode.id === activeState.modes?.currentModeId,
	)?.name;
	const currentModelName =
		modelOption?.options?.find((item) => item.value === modelOption.currentValue)?.name ||
		modelOption?.currentValue;
	/** ACP 返回的模型名形如「kcoder-glm-flash · GLM-5.3-Flash」，底部只留型号 */
	const shortModelName =
		(currentModelName || "").split("·").pop()?.trim() || currentModelName || "";

	// 模型详情面板只列模型相关能力；运行模式已移到输入区的「添加」聚合菜单
	const modelRows: ModelRow[] = [];
	if (thoughtOption?.options && thoughtOption.options.length > 0) {
		modelRows.push({
			id: thoughtOption.id,
			label: "思考强度",
			valueLabel: pickLabel(THINKING_LABEL, thoughtOption.currentValue),
			currentValue: thoughtOption.currentValue,
			options: thoughtOption.options.map((item) => ({
				value: item.value,
				label: pickLabel(THINKING_LABEL, item.value, item.name),
			})),
			onSelect: (value) => void changeConfigOption(thoughtOption.id, value),
		});
	}
	for (const option of otherSelects) {
		if (option.type === "boolean") {
			modelRows.push({
				id: option.id,
				label: option.name,
				valueLabel: option.currentBoolean ? "已开启" : "已关闭",
				onSelect: () => void changeConfigOption(option.id, !option.currentBoolean),
			});
			continue;
		}
		if (!option.options || option.options.length === 0) continue;
		modelRows.push({
			id: option.id,
			label: option.name,
			valueLabel:
				option.options.find((item) => item.value === option.currentValue)?.name ||
				option.currentValue ||
				"",
			currentValue: option.currentValue,
			options: option.options.map((item) => ({ value: item.value, label: item.name })),
			onSelect: (value) => void changeConfigOption(option.id, value),
		});
	}
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
				searchOpen={searchOpen}
				onToggleSearch={() => {
					setSearchOpen((value) => !value);
					if (searchOpen) setSearchText("");
				}}
				showPreview={showPreview}
				onTogglePreview={() => setShowPreview((value) => !value)}
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
							{searchOpen && (
								<div className="omp-searchbar" role="search">
									<Icon name="search" size={15} />
									<input
										ref={searchInputRef}
										autoFocus
										value={searchText}
										onChange={(event) => {
											setSearchText(event.target.value);
											setSearchIndex(0);
										}}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												event.preventDefault();
												jumpSearch(event.shiftKey ? -1 : 1);
											}
										}}
										placeholder="搜索对话内容"
										aria-label="搜索对话内容"
									/>
									{searchText && (
										<span className="omp-search-count">
											{searchHitCount ? searchIndex + 1 : 0}/{searchHitCount}
										</span>
									)}
									<button
										type="button"
										className="omp-search-nav"
										onClick={() => jumpSearch(-1)}
										disabled={!searchHitCount}
										title="上一处"
										aria-label="上一处搜索结果"
									>
										<Icon name="chevron" size={13} className="omp-search-up" />
									</button>
									<button
										type="button"
										className="omp-search-nav"
										onClick={() => jumpSearch(1)}
										disabled={!searchHitCount}
										title="下一处"
										aria-label="下一处搜索结果"
									>
										<Icon name="chevron" size={13} />
									</button>
									<button
										type="button"
										className="omp-search-close"
										onClick={() => {
											setSearchOpen(false);
											setSearchText("");
										}}
										title="关闭搜索"
										aria-label="关闭搜索"
									>
										<Icon name="close" size={13} />
									</button>
								</div>
							)}
							<div className="omp-messages-wrap">
								<div className="omp-messages" ref={scrollRef} onScroll={updateAtBottom}>
									{visibleMessages.length === 0 && (
										<div className="omp-empty">
											<div className="omp-empty-mark">
												<Icon name="spark" size={28} />
											</div>
											<h2>把任务交给 omp</h2>
											<p>它会在当前工作目录中读取文件、执行命令，并把过程展现在这里。</p>
											<div className="omp-empty-hints">
												{settings.homeSuggestions &&
													[
														"解释当前目录的代码结构",
														"帮我修复一个失败的测试",
														"梳理这个项目的待办事项",
													].map((hint) => (
														<button
															key={hint}
															type="button"
															onClick={() => {
																if (!editor.range()) editor.focus();
																editor.insertText(hint);
																syncFromEditor();
																editor.focus();
															}}
														>
															{hint}
															<Icon name="chevron-right" size={12} />
														</button>
													))}
											</div>
										</div>
									)}

									{visibleMessages.map((message, messageIndex) => {
										const hasPendingTool = message.blocks.some(
											(block) => block.type === "tool_call" && block.status === "pending",
										);
										const isActive = running && messageIndex === visibleMessages.length - 1;
										const generating = message.role === "agent" && (isActive || hasPendingTool);
										let splitAt = message.blocks.length;
										while (splitAt > 0 && message.blocks[splitAt - 1].type === "text") splitAt -= 1;
										const processBlocks = message.blocks.slice(0, splitAt);
										const finalBlocks = message.blocks.slice(splitAt);
										const hasProcessFold =
											message.role === "agent" &&
											processBlocks.length > 0 &&
											finalBlocks.length > 0 &&
											!isActive;
										const contentBlocks = hasProcessFold ? finalBlocks : message.blocks;
										return (
											<article
												key={message.id}
												className={`omp-message ${message.role}`}
												data-message-id={message.id}
											>
												<div className="omp-message-avatar">
													{message.role === "user" ? (
														"你"
													) : message.role === "agent" ? (
														<Icon name="spark" size={13} />
													) : (
														<Icon name="warning" size={13} />
													)}
												</div>
												<div className="omp-message-body">
													<div className="omp-message-meta">
														<span>
															{message.role === "user"
																? "你"
																: message.role === "agent"
																	? "omp"
																	: "系统"}
														</span>
														<time>
															{new Date(message.ts).toLocaleTimeString("zh-CN", {
																hour: "2-digit",
																minute: "2-digit",
															})}
														</time>
														{message.role === "user" && message.durationMs !== undefined && (
															<span className="omp-duration">
																<Icon name="check" size={11} /> 已完成{" "}
																{formatDuration(message.durationMs)}
															</span>
														)}
													</div>
													{message.role === "agent" &&
														(hasProcessFold ? (
															<details className="omp-process-fold">
																<summary className="omp-agent-status">
																	<Icon name="check" size={11} />
																	<span>
																		已完成
																		{message.durationMs !== undefined
																			? ` ${formatDuration(message.durationMs)}`
																			: ""}
																	</span>
																	<span className="omp-process-hint">查看处理过程</span>
																	<Icon name="chevron" size={12} className="omp-fold-chevron" />
																</summary>
																<div className="omp-process-body">
																	{processBlocks.map((block, blockIndex) => (
																		<Block
																			key={blockIndex}
																			block={block}
																			onOpenDoc={openDoc}
																			query={searchText.trim()}
																		/>
																	))}
																</div>
															</details>
														) : (
															<div className={`omp-agent-status ${generating ? "busy" : ""}`}>
																<Icon name={generating ? "spark" : "check"} size={11} />
																{generating ? "生成中" : "已完成"}
															</div>
														))}
													{contentBlocks.length > 0 && (
														<div className="omp-message-content">
															{contentBlocks.map((block, blockIndex) => (
																<Block
																	key={blockIndex}
																	block={block}
																	onOpenDoc={openDoc}
																	query={searchText.trim()}
																/>
															))}
														</div>
													)}
													<MessageActions
														text={message.blocks.map((block) => block.text).join("\n")}
														onRetry={
															message.role === "user" ? () => retryMessage(message) : undefined
														}
													/>
												</div>
											</article>
										);
									})}

									{running && (
										<div className="omp-typing">
											<span className="omp-typing-dots">
												<i />
												<i />
												<i />
											</span>
											omp 正在处理
										</div>
									)}
								</div>
								{!atBottom && (
									<div className="omp-scroll-bottom">
										<button
											type="button"
											onClick={scrollToBottom}
											title="回到最底部"
											aria-label="回到最底部"
										>
											<Icon name="chevron" size={16} />
										</button>
									</div>
								)}
							</div>

							<div className="omp-composer-wrap">
								<div className="omp-composer">
									{resourceSuggestOpen && (
										<SuggestMenu
											label="引用资源"
											count={resourceCandidates.length}
											empty="暂无可引用的文件/网址，可直接粘贴网址或选择本地文件"
											entries={resourceCandidates.map((candidate) => ({
												key: `${candidate.group}:${candidate.value}`,
												icon:
													candidate.group === "网址" ? (
														<Icon name="link" size={13} />
													) : (
														<Icon name="file" size={13} />
													),
												title: candidate.label,
												detail: `${candidate.group} · ${candidate.detail}`,
											}))}
											activeIndex={resourceActive}
											onHover={setResourceActive}
											onSelect={(index) => applyResource(resourceCandidates[index])}
											footer={{
												icon: "folder",
												label: "从本地选择文件…",
												onSelect: () => {
													setResourceSuggestOpen(false);
													void insertFileReference();
												},
											}}
										/>
									)}
									{skillSuggestOpen && (
										<SuggestMenu
											label="技能"
											count={skillSuggestions.length}
											empty="没有匹配的已安装技能"
											entries={skillSuggestions.map((skill) => ({
												key: skill.name,
												icon: skill.name.slice(0, 1).toUpperCase(),
												title: skill.name,
												detail: skill.description,
											}))}
											activeIndex={skillActive}
											onHover={setSkillActive}
											onSelect={(index) => applySkill(skillSuggestions[index].name)}
										/>
									)}
									<div
										ref={editorRef}
										className="omp-composer-input"
										contentEditable={connected && !running}
										suppressContentEditableWarning
										role="textbox"
										aria-multiline="true"
										aria-label="任务输入框"
										data-placeholder={connected ? "描述任务，按 Enter 发送" : "等待连接 omp…"}
										onInput={onEditorInput}
										onBeforeInput={onEditorBeforeInput}
										onKeyDown={onEditorKeyDown}
										onMouseDown={onEditorMouseDown}
										onCompositionStart={() => {
											composingRef.current = true;
										}}
										onCompositionEnd={() => {
											composingRef.current = false;
											onEditorInput();
										}}
										onBlur={() => setSkillSuggestOpen(false)}
									/>
									<div className="omp-composer-footer">
										<div className="omp-composer-hint">
											<EntryMenu
												open={entryMenuOpen}
												submenu={entrySubmenu}
												onToggleOpen={() => {
													setEntrySubmenu(null);
													setEntryMenuOpen((value) => !value);
												}}
												onChangeSubmenu={setEntrySubmenu}
												onClose={() => {
													setEntryMenuOpen(false);
													setEntrySubmenu(null);
												}}
												menuRef={entryMenuRef}
												currentModeName={currentModeName}
												modes={activeState?.modes ?? null}
												onSelectMode={(modeId) => void changeMode(modeId)}
												skills={installedSkills}
												onSelectSkill={applySkill}
												onManageSkills={() => setShowSkills(true)}
												mcpConfig={mcpConfig}
												onInsertFile={() => void insertFileReference()}
												onOpenResourceSuggest={openResourceSuggest}
											/>
											<span className="omp-path-label" title={settings.cwd}>
												{shortPath(settings.cwd)}
											</span>
										</div>
										<div className="omp-composer-tools">
											<ApprovalMenu
												open={approvalOpen}
												mode={settings.approvalMode}
												wrapRef={approvalRef}
												onToggle={() => setApprovalOpen((value) => !value)}
												onSelect={(mode) => void changeApprovalMode(mode)}
											/>
											<button
												type="button"
												className={`omp-model-trigger ${modelMenuOpen ? "active" : ""}`}
												onClick={() => {
													setOpenModelRow(null);
													setModelMenuOpen((value) => !value);
												}}
												title="模型与推理档位"
												aria-label="模型与推理档位"
											>
												<Icon name="spark" size={13} />
												<span className="omp-model-label">{currentModelName || "模型"}</span>
												<Icon name="chevron" size={12} />
											</button>
											<ContextPanel
												open={contextOpen}
												percent={contextPercent}
												report={report}
												shortModelName={shortModelName}
												wrapRef={contextRef}
												onToggle={() => {
													const next = !contextOpen;
													setContextOpen(next);
													if (next && activeId) void probeContext(activeId);
												}}
												onClose={() => setContextOpen(false)}
											/>
											{running ? (
												<button
													type="button"
													className="omp-send stop"
													onClick={cancel}
													title="停止当前任务"
												>
													<Icon name="stop" size={13} />
													<span className="omp-btn-label">停止</span>
												</button>
											) : (
												<button
													type="button"
													className="omp-send"
													onClick={() => void send()}
													disabled={!connected || !input.trim()}
													title="发送"
												>
													<Icon name="send" size={13} />
													<span className="omp-btn-label">发送</span>
												</button>
											)}
										</div>
									</div>
									<ModelPanel
										open={modelMenuOpen}
										modelName={currentModelName}
										modelOption={modelOption ?? null}
										contexts={modelContexts}
										rows={modelRows}
										currentContext={currentContext}
										openRowId={openModelRow}
										onOpenRow={setOpenModelRow}
										onSelectModel={(optionId, value) => void changeConfigOption(optionId, value)}
										onOpenSettings={() => {
											setModelMenuOpen(false);
											setShowSettings(true);
										}}
									/>
								</div>
								<div className="omp-disclaimer">内容由 AI 生成，请核对重要信息</div>
							</div>
						</section>

						{showPreview && (
							<PreviewPane
								docs={docs}
								currentDoc={currentDoc}
								activeDoc={activeDoc}
								onSelectDoc={setActiveDoc}
								onCloseDoc={closeDoc}
								onReload={() => void reloadDoc()}
								onOpenFile={() => void openLocalFile()}
								onClose={() => setShowPreview(false)}
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
						editor.clear();
						setInput("");
						setSkillChips([]);
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
						applySkill(name);
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
