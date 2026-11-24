import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	AcpClient,
	type AcpEvent,
	type ChatMessage,
	type ContentBlock,
	type DesktopSettings,
	type ThemeMode,
} from "./acp-client";
import { DEFAULT_DOCS, type DocFile } from "./docs";

interface Session {
	id: string;
	title: string;
}

interface PermissionState {
	sessionId: string;
	title: string;
	options: Array<{ optionId: string; name: string; kind: string }>;
	respond: (result: unknown) => void;
}

type IconName =
	| "plus"
	| "settings"
	| "sun"
	| "moon"
	| "monitor"
	| "folder"
	| "file"
	| "close"
	| "send"
	| "stop"
	| "chevron"
	| "panel"
	| "refresh"
	| "copy"
	| "check"
	| "spark"
	| "warning";

const uid = () => Math.random().toString(36).slice(2, 10);

const THEME_LABEL: Record<ThemeMode, string> = {
	light: "浅色",
	dark: "深色",
	system: "跟随系统",
};

function shortPath(path: string) {
	const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
	return parts.slice(-2).join("/") || "工作目录";
}

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
	const common = {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.8,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		"aria-hidden": true,
	};
	switch (name) {
		case "plus":
			return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
		case "settings":
			return (
				<svg {...common}>
					<circle cx="12" cy="12" r="3" />
					<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2H8.9v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2.8-2.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H1.8v-3.9h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.8-2.8.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V2h3.9v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.2v3.9h-.2a1.7 1.7 0 0 0-1.5 1Z" />
				</svg>
			);
		case "sun":
			return (
				<svg {...common}>
					<circle cx="12" cy="12" r="4" />
					<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
				</svg>
			);
		case "moon":
			return <svg {...common}><path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.7 6.7 0 0 0 10.7 10.7Z" /></svg>;
		case "monitor":
			return (
				<svg {...common}>
					<rect x="3" y="4" width="18" height="13" rx="2" />
					<path d="M8 21h8M12 17v4" />
				</svg>
			);
		case "folder":
			return <svg {...common}><path d="M3 7.5h6.2l2 2H21v9.5H3z" /></svg>;
		case "file":
			return <svg {...common}><path d="M6 3h8l4 4v14H6zM14 3v5h4" /></svg>;
		case "close":
			return <svg {...common}><path d="M6 6l12 12M18 6 6 18" /></svg>;
		case "send":
			return <svg {...common}><path d="M4 12 20 4l-6.5 16-2.7-6.8L4 12Z" /></svg>;
		case "stop":
			return <svg {...common}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>;
		case "chevron":
			return <svg {...common}><path d="m6 9 6 6 6-6" /></svg>;
		case "panel":
			return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></svg>;
		case "refresh":
			return <svg {...common}><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></svg>;
		case "copy":
			return <svg {...common}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
		case "check":
			return <svg {...common}><path d="m5 12 4.5 4.5L19 7" /></svg>;
		case "spark":
			return <svg {...common}><path d="m12 3 2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1L12 3Z" /></svg>;
		case "warning":
			return <svg {...common}><path d="M12 3 2.5 20h19L12 3ZM12 9v5M12 17.5v.5" /></svg>;
	}
}

type MdBlock =
	| { type: "heading"; level: number; text: string }
	| { type: "paragraph"; text: string }
	| { type: "list"; items: string[] }
	| { type: "code"; lang: string; text: string };

function parseMarkdown(source: string): MdBlock[] {
	const lines = source.replace(/\r\n/g, "\n").split("\n");
	const blocks: MdBlock[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (/^\s*```/.test(line)) {
			const lang = line.replace(/^\s*```/, "").trim();
			i += 1;
			const code: string[] = [];
			while (i < lines.length && !/^\s*```/.test(lines[i])) {
				code.push(lines[i]);
				i += 1;
			}
			if (i < lines.length) i += 1;
			blocks.push({ type: "code", lang, text: code.join("\n") });
			continue;
		}

		const heading = /^(#{1,6})\s+(.+)$/.exec(line);
		if (heading) {
			blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
			i += 1;
			continue;
		}

		if (/^\s*[-*]\s+/.test(line)) {
			const items: string[] = [];
			while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
				items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
				i += 1;
			}
			blocks.push({ type: "list", items });
			continue;
		}

		if (!line.trim()) {
			i += 1;
			continue;
		}

		const paragraph: string[] = [];
		while (
			i < lines.length &&
			lines[i].trim() &&
			!/^\s*```/.test(lines[i]) &&
			!/^#{1,6}\s+/.test(lines[i]) &&
			!/^\s*[-*]\s+/.test(lines[i])
		) {
			paragraph.push(lines[i]);
			i += 1;
		}
		blocks.push({ type: "paragraph", text: paragraph.join(" ") });
	}

	return blocks;
}

function InlineText({ text }: { text: string }) {
	const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
	return (
		<>
			{parts.map((part, index) => {
				if (part.startsWith("`") && part.endsWith("`")) {
					return <code key={index}>{part.slice(1, -1)}</code>;
				}
				if (part.startsWith("**") && part.endsWith("**")) {
					return <strong key={index}>{part.slice(2, -2)}</strong>;
				}
				return <span key={index}>{part}</span>;
			})}
		</>
	);
}

function CodeBlock({
	code,
	lang,
	onOpen,
}: {
	code: string;
	lang?: string;
	onOpen?: (name: string, content: string) => void;
}) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1400);
		} catch {
			setCopied(false);
		}
	};

	return (
		<div className="omp-codeblock">
			<div className="omp-codeblock-head">
				<span>{lang || "text"}</span>
				<div>
					<button type="button" onClick={copy} title="复制代码">
						<Icon name={copied ? "check" : "copy"} size={13} />
						{copied ? "已复制" : "复制"}
					</button>
					{onOpen && (
						<button type="button" onClick={() => onOpen("snippet.md", code)} title="在预览中打开">
							<Icon name="file" size={13} />
							预览
						</button>
					)}
				</div>
			</div>
			<pre><code>{code}</code></pre>
		</div>
	);
}

function Markdown({ text, onOpen }: { text: string; onOpen: (name: string, content: string) => void }) {
	const blocks = useMemo(() => parseMarkdown(text), [text]);
	return (
		<div className="omp-markdown">
			{blocks.map((block, index) => {
				if (block.type === "heading") {
					const Tag = `h${Math.min(block.level + 1, 6)}` as "h2" | "h3" | "h4" | "h5" | "h6";
					return <Tag key={index}><InlineText text={block.text} /></Tag>;
				}
				if (block.type === "list") {
					return (
						<ul key={index}>
							{block.items.map((item, itemIndex) => <li key={itemIndex}><InlineText text={item} /></li>)}
						</ul>
					);
				}
				if (block.type === "code") {
					return <CodeBlock key={index} code={block.text} lang={block.lang} onOpen={onOpen} />;
				}
				return <p key={index}><InlineText text={block.text} /></p>;
			})}
		</div>
	);
}

const TOOL_STATUS: Record<string, { label: string; icon: IconName }> = {
	pending: { label: "执行中", icon: "spark" },
	completed: { label: "已完成", icon: "check" },
	failed: { label: "失败", icon: "warning" },
};

function Block({ block, onOpenDoc }: { block: ContentBlock; onOpenDoc: (name: string, content: string) => void }) {
	if (block.type === "thinking") {
		return (
			<details className="omp-thinking">
				<summary><Icon name="spark" size={13} /> 思考过程</summary>
				<div className="omp-thinking-body"><Markdown text={block.text} onOpen={onOpenDoc} /></div>
			</details>
		);
	}

	if (block.type === "tool_call") {
		const status = TOOL_STATUS[block.status || "pending"];
		const raw = block.raw as Record<string, unknown> | undefined;
		const title = typeof raw?.title === "string" ? raw.title : "";
		const hasResult = block.status !== "pending" && block.text !== raw?.toolCallId && block.text.length > 0;
		return (
			<div className={`omp-tool-card ${block.status || "pending"}`}>
				<div className="omp-tool-main">
					<span className="omp-tool-icon"><Icon name={status.icon} size={14} /></span>
					<div className="omp-tool-copy">
						<div className="omp-tool-title">{block.toolName}</div>
						{title && <div className="omp-tool-subtitle">{title}</div>}
					</div>
					<span className="omp-tool-status">{status.label}</span>
				</div>
				{hasResult && (
					<details className="omp-tool-result">
						<summary>查看结果</summary>
						<pre>{block.text}</pre>
					</details>
				)}
			</div>
		);
	}

	if (block.type === "tool_result" || block.type === "diff" || block.type === "other") {
		return <CodeBlock code={block.text} />;
	}

	return <Markdown text={block.text} onOpen={onOpenDoc} />;
}

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
	const [settings, setSettings] = useState<DesktopSettings>({
		ompCliPath: "",
		bunPath: "",
		cwd: "",
		theme: "system",
	});
	const [permission, setPermission] = useState<PermissionState | null>(null);
	const [docs, setDocs] = useState<DocFile[]>(DEFAULT_DOCS);
	const [activeDoc, setActiveDoc] = useState<string | null>(null);
	const [showPreview, setShowPreview] = useState(true);

	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const toolIndex = useRef<Map<string, number>>(new Map());
	const activeIdRef = useRef<string | null>(null);

	const messages = activeId ? messagesBySession[activeId] || [] : [];
	const currentDoc = docs.find((doc) => doc.key === activeDoc);

	useEffect(() => {
		activeIdRef.current = activeId;
	}, [activeId]);

	useEffect(() => {
		const root = document.documentElement;
		root.dataset.theme = settings.theme;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const apply = () => {
			root.dataset.resolvedTheme = settings.theme === "system" ? (media.matches ? "dark" : "light") : settings.theme;
		};
		apply();
		media.addEventListener("change", apply);
		return () => media.removeEventListener("change", apply);
	}, [settings.theme]);

	useEffect(() => {
		const el = inputRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
	}, [input]);

	const updateMessages = useCallback((sessionId: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
		setMessagesBySession((prev) => ({ ...prev, [sessionId]: updater(prev[sessionId] || []) }));
	}, []);

	const appendBlock = useCallback(
		(sessionId: string, block: ContentBlock, toolCallId?: string) => {
			updateMessages(sessionId, (prev) => {
				const last = prev[prev.length - 1];
				if (last?.role === "agent" && !toolCallId) {
					const copy = [...prev];
					copy[copy.length - 1] = { ...last, blocks: [...last.blocks, block] };
					return copy;
				}
				const message: ChatMessage = { id: uid(), role: "agent", blocks: [block], ts: Date.now() };
				if (toolCallId) toolIndex.current.set(`${sessionId}:${toolCallId}`, prev.length);
				return [...prev, message];
			});
		},
		[updateMessages],
	);

	const updateToolStatus = useCallback(
		(sessionId: string, toolCallId: string, next: "completed" | "failed", result?: string) => {
			const index = toolIndex.current.get(`${sessionId}:${toolCallId}`);
			if (index === undefined) return;
			updateMessages(sessionId, (prev) => {
				const copy = [...prev];
				const message = copy[index];
				if (!message) return prev;
				copy[index] = {
					...message,
					blocks: message.blocks.map((block) =>
						block.toolName && block.text === toolCallId ? { ...block, status: next, text: result || block.text } : block,
					),
				};
				return copy;
			});
		},
		[updateMessages],
	);

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
				const content = update.content as { text?: string } | undefined;

				if (kind === "agent_message_chunk" && content?.text) {
					appendBlock(sessionId, { type: "text", text: content.text });
				} else if (kind === "agent_thought_chunk" && content?.text) {
					appendBlock(sessionId, { type: "thinking", text: content.text });
				} else if (kind === "tool_call") {
					const toolCallId = update.toolCallId as string;
					appendBlock(
						sessionId,
						{
							type: "tool_call",
							text: toolCallId,
							toolName: (update.title as string) || (update.kind as string) || "tool",
							status: "pending",
							raw: update,
						},
						toolCallId,
					);
				} else if (kind === "tool_call_update") {
					const toolCallId = update.toolCallId as string;
					const next = update.status as string;
					if (next === "completed" || next === "failed") {
						const result = (update.content as { text?: string } | undefined)?.text;
						updateToolStatus(sessionId, toolCallId, next === "completed" ? "completed" : "failed", result);
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
					options: (params.options as Array<{ optionId: string; name: string; kind: string }>) || [],
					respond: event.respond,
				});
			} else if (event.method === "fs/read_text_file") {
				event.respondError(-32601, "文件读取将在外壳桥接完成后可用");
			} else if (event.method === "fs/write_text_file") {
				event.respondError(-32601, "文件写入将在外壳桥接完成后可用");
			} else if (event.method.startsWith("terminal/")) {
				event.respondError(-32601, "终端能力将在外壳桥接完成后可用");
			} else {
				event.respond({});
			}
		},
		[appendBlock, updateToolStatus],
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
		setClient(acp);

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
				const session = await acp.newSession(loaded.cwd);
				setSessions([{ id: session.sessionId, title: "会话 1" }]);
				setActiveId(session.sessionId);
				setConnected(true);
				setStatus("已连接");
			} catch (error) {
				setStatus(`握手失败：${(error as Error).message}`);
			}
		})();

		return () => acp.stop();
	}, [handleEvent]);

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
	}, [messages.length, permission, running]);

	const send = async () => {
		const text = input.trim();
		if (!client || !activeId || !text || running) return;
		setInput("");
		updateMessages(activeId, (prev) => [
			...prev,
			{ id: uid(), role: "user", blocks: [{ type: "text", text }], ts: Date.now() },
		]);
		setRunning(true);
		try {
			await client.prompt(activeId, text);
		} catch (error) {
			updateMessages(activeId, (prev) => [
				...prev,
				{
					id: uid(),
					role: "system",
					blocks: [{ type: "text", text: `请求失败：${(error as Error).message}` }],
					ts: Date.now(),
				},
			]);
		} finally {
			setRunning(false);
			inputRef.current?.focus();
		}
	};

	const cancel = () => {
		if (client && activeId) client.cancel(activeId);
	};

	const newSession = async () => {
		if (!client) return;
		try {
			const loaded = await window.desktop.settings.get();
			const session = await client.newSession(loaded.cwd);
			setSessions((prev) => [...prev, { id: session.sessionId, title: `会话 ${prev.length + 1}` }]);
			setActiveId(session.sessionId);
			setRunning(false);
		} catch (error) {
			setStatus(`新建会话失败：${(error as Error).message}`);
		}
	};

	const changeTheme = async (theme: ThemeMode) => {
		const next = { ...settings, theme };
		setSettings(next);
		try {
			await window.desktop.settings.set({ theme });
		} catch (error) {
			setStatus(`主题保存失败：${(error as Error).message}`);
		}
	};

	const saveSettings = async () => {
		try {
			await window.desktop.settings.set(settings);
			setShowSettings(false);
			setStatus("设置已保存");
		} catch (error) {
			setStatus(`设置保存失败：${(error as Error).message}`);
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
			const reference = file.path.includes(" ") ? `@"${file.path}"` : `@${file.path}`;
			setInput((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${reference} `);
			inputRef.current?.focus();
		} catch (error) {
			setStatus(`引用文件失败：${(error as Error).message}`);
		}
	};

	const reloadDoc = async () => {
		if (!currentDoc?.path) return;
		try {
			const file = await window.desktop.files.read(currentDoc.path);
			setDocs((prev) =>
				prev.map((doc) =>
					doc.key === currentDoc.key ? { ...doc, content: file.content, language: file.language } : doc,
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

	return (
		<div className="omp-app">
			<header className="omp-titlebar">
				<div className="omp-titlebar-left">
					<span className="omp-logo"><Icon name="spark" size={15} /></span>
					<span className="omp-product">OMP Desktop</span>
					<span className="omp-title-divider" />
					<span className="omp-tagline">Coding Agent Shell</span>
				</div>
				<div className="omp-titlebar-right">
					<span className={`omp-connection ${connected ? "online" : "offline"}`} title={status}>
						<span className="omp-connection-dot" />
						{connected ? "已连接" : "未连接"}
					</span>
					<div className="omp-theme-switch" role="group" aria-label="主题模式">
						{(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
							<button
								key={mode}
								type="button"
								className={settings.theme === mode ? "active" : ""}
								onClick={() => changeTheme(mode)}
								title={THEME_LABEL[mode]}
								aria-label={THEME_LABEL[mode]}
							>
								<Icon name={mode === "light" ? "sun" : mode === "dark" ? "moon" : "monitor"} size={14} />
							</button>
						))}
					</div>
					<button type="button" className="omp-icon-button" onClick={() => setShowSettings(true)} title="设置" aria-label="设置">
						<Icon name="settings" size={15} />
					</button>
				</div>
			</header>

			<div className="omp-workspace">
				<aside className="omp-sidebar">
					<button type="button" className="omp-new-session" onClick={newSession} disabled={!connected}>
						<Icon name="plus" size={15} />
						新建会话
					</button>

					<div className="omp-sidebar-section">
						<div className="omp-section-heading">
							<span>会话</span>
							<span className="omp-count">{sessions.length}</span>
						</div>
						<div className="omp-session-list">
							{sessions.map((session) => (
								<button
									key={session.id}
									type="button"
									className={`omp-session ${session.id === activeId ? "active" : ""}`}
									onClick={() => setActiveId(session.id)}
									title={session.id}
								>
									<Icon name="file" size={14} />
									<span>{session.title}</span>
								</button>
							))}
						</div>
					</div>

					<div className="omp-sidebar-footer">
						<div className="omp-workdir" title={settings.cwd}>
							<Icon name="folder" size={14} />
							<span>{shortPath(settings.cwd)}</span>
						</div>
						<button type="button" className="omp-sidebar-setting" onClick={() => setShowSettings(true)}>
							<Icon name="settings" size={14} />
							设置
						</button>
					</div>
				</aside>

				<main className="omp-main">
					<div className="omp-topbar">
						<div className="omp-breadcrumb">
							<span>会话</span>
							<span className="omp-crumb-sep">/</span>
							<strong>{activeTitle}</strong>
						</div>
						<div className="omp-topbar-actions">
							<span className="omp-topbar-status" title={status}>{status}</span>
							<button
								type="button"
								className={`omp-icon-button ${showPreview ? "active" : ""}`}
								onClick={() => setShowPreview((value) => !value)}
								title={showPreview ? "隐藏文件预览" : "显示文件预览"}
								aria-label="切换文件预览"
							>
								<Icon name="panel" size={15} />
							</button>
						</div>
					</div>

					<div className="omp-content">
						<section className="omp-chat">
							<div className="omp-messages" ref={scrollRef}>
								{messages.length === 0 && (
									<div className="omp-empty">
										<div className="omp-empty-mark"><Icon name="spark" size={28} /></div>
										<h2>把任务交给 omp</h2>
										<p>它会在当前工作目录中读取文件、执行命令，并把过程展现在这里。</p>
										<div className="omp-empty-hints">
											<span>解释这段代码</span>
											<span>修复测试失败</span>
											<span>整理目录结构</span>
										</div>
									</div>
								)}

								{messages.map((message) => (
									<article key={message.id} className={`omp-message ${message.role}`}>
										<div className="omp-message-avatar">
											{message.role === "user" ? "你" : message.role === "agent" ? <Icon name="spark" size={13} /> : <Icon name="warning" size={13} />}
										</div>
										<div className="omp-message-body">
											<div className="omp-message-meta">
												<span>{message.role === "user" ? "你" : message.role === "agent" ? "omp" : "系统"}</span>
												<time>{new Date(message.ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
											</div>
											<div className="omp-message-content">
												{message.blocks.map((block, index) => (
													<Block key={index} block={block} onOpenDoc={openDoc} />
												))}
											</div>
										</div>
									</article>
								))}

								{running && (
									<div className="omp-typing">
										<span className="omp-typing-dots"><i /><i /><i /></span>
										omp 正在处理
									</div>
								)}
							</div>

							<div className="omp-composer-wrap">
								<div className="omp-composer">
									<textarea
										ref={inputRef}
										value={input}
										onChange={(event) => setInput(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter" && !event.shiftKey) {
												event.preventDefault();
												send();
											}
										}}
										placeholder={connected ? "描述任务，按 Enter 发送" : "等待连接 omp…"}
										disabled={!connected || running}
										aria-label="任务输入框"
									/>
									<div className="omp-composer-footer">
										<div className="omp-composer-hint">
											<button type="button" className="omp-reference" onClick={insertFileReference} title="选择文件并插入引用">
												<Icon name="folder" size={13} />
												引用文件
											</button>
											<span title={settings.cwd}>{shortPath(settings.cwd)}</span>
											<span className="omp-hint-sep">·</span>
											<span>Enter 发送，Shift + Enter 换行</span>
										</div>
										{running ? (
											<button type="button" className="omp-send stop" onClick={cancel} title="停止当前任务">
												<Icon name="stop" size={13} /> 停止
											</button>
										) : (
											<button type="button" className="omp-send" onClick={send} disabled={!connected || !input.trim()} title="发送">
												<Icon name="send" size={13} /> 发送
											</button>
										)}
									</div>
								</div>
								<div className="omp-disclaimer">内容由 AI 生成，请核对重要信息</div>
							</div>
						</section>

						{showPreview && (
							<aside className="omp-preview">
								<div className="omp-preview-head">
									<div>
										<Icon name="file" size={14} />
										<span>文件预览</span>
										{currentDoc && (
											<span className="omp-preview-current" title={currentDoc.path || currentDoc.name}>
												· {currentDoc.name}
											</span>
										)}
									</div>
									<div className="omp-preview-actions">
										<button type="button" className="omp-icon-button" onClick={openLocalFile} title="打开文件" aria-label="打开文件">
											<Icon name="folder" size={14} />
										</button>
										{currentDoc?.path && (
											<button type="button" className="omp-icon-button" onClick={reloadDoc} title="重新读取文件" aria-label="重新读取文件">
												<Icon name="refresh" size={14} />
											</button>
										)}
										<button type="button" className="omp-icon-button" onClick={() => setShowPreview(false)} title="关闭预览" aria-label="关闭预览">
											<Icon name="close" size={14} />
										</button>
									</div>
								</div>
								<div className="omp-file-tabs">
									{docs.map((doc) => (
										<div key={doc.key} className={`omp-file-tab ${activeDoc === doc.key ? "active" : ""}`}>
											<button type="button" onClick={() => setActiveDoc(doc.key)} title={doc.path || doc.name}>
												<Icon name="file" size={12} />
												<span>{doc.name}</span>
											</button>
											<button type="button" className="omp-tab-close" onClick={() => closeDoc(doc.key)} title="关闭" aria-label={`关闭 ${doc.name}`}>
												<Icon name="close" size={11} />
											</button>
										</div>
									))}
								</div>
								<div className="omp-preview-body">
									{currentDoc ? (
										<CodeBlock code={currentDoc.content} lang={currentDoc.language} />
									) : (
										<div className="omp-preview-empty">
											<Icon name="file" size={24} />
											<p>暂无预览文件</p>
											<span>打开文件，或在回复中打开代码块</span>
											<button type="button" className="omp-preview-open" onClick={openLocalFile}>
												<Icon name="folder" size={13} />
												选择文件
											</button>
										</div>
									)}
								</div>
							</aside>
						)}
					</div>
				</main>
			</div>

			{permission && (
				<div className="omp-modal-layer" role="dialog" aria-modal="true" aria-label="权限确认">
					<div className="omp-modal">
						<div className="omp-modal-icon warning"><Icon name="warning" size={18} /></div>
						<h3>需要你的确认</h3>
						<p>omp 请求执行以下操作，请确认是否允许。</p>
						<div className="omp-permission-title">{permission.title}</div>
						<div className="omp-modal-actions">
							{permission.options.map((option) => (
								<button
									key={option.optionId}
									type="button"
									className={/reject|deny|cancel/i.test(option.kind) ? "secondary" : "primary"}
									onClick={() => {
										permission.respond({ outcome: { outcome: "selected", optionId: option.optionId } });
										setPermission(null);
									}}
								>
									{option.name}
								</button>
							))}
						</div>
					</div>
				</div>
			)}

			{showSettings && (
				<div className="omp-modal-layer" role="dialog" aria-modal="true" aria-label="设置">
					<div className="omp-modal settings">
						<div className="omp-modal-icon"><Icon name="settings" size={18} /></div>
						<h3>设置</h3>
						<p>修改后会在下次启动会话时生效，主题会立即应用。</p>
						<label>
							<span>omp CLI 路径</span>
							<input value={settings.ompCliPath} onChange={(event) => setSettings({ ...settings, ompCliPath: event.target.value })} />
						</label>
						<label>
							<span>bun 路径</span>
							<input value={settings.bunPath} onChange={(event) => setSettings({ ...settings, bunPath: event.target.value })} />
						</label>
						<label>
							<span>工作目录</span>
							<input value={settings.cwd} onChange={(event) => setSettings({ ...settings, cwd: event.target.value })} />
						</label>
						<div className="omp-settings-theme">
							<span>主题</span>
							<div className="omp-theme-switch" role="group" aria-label="主题模式">
								{(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
									<button
										key={mode}
										type="button"
										className={settings.theme === mode ? "active" : ""}
										onClick={() => setSettings({ ...settings, theme: mode })}
									>
										{THEME_LABEL[mode]}
									</button>
								))}
							</div>
						</div>
						<div className="omp-modal-actions">
							<button type="button" className="secondary" onClick={() => setShowSettings(false)}>取消</button>
							<button type="button" className="primary" onClick={saveSettings}>保存</button>
						</div>
					</div>
				</div>
			)}

			{stderrLog.length > 0 && (
				<details className="omp-logs">
					<summary><Icon name="warning" size={12} /> omp 日志（{stderrLog.length}）</summary>
					<pre>{stderrLog.join("")}</pre>
				</details>
			)}
		</div>
	);
}
