import { useCallback, useEffect, useRef, useState } from "react";
import { AcpClient, type AcpEvent, type ChatMessage, type ContentBlock } from "./acp-client";
import { DEFAULT_DOCS, type DocFile } from "./docs";

interface Session {
	id: string;
	title: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function App() {
	const [client, setClient] = useState<AcpClient | null>(null);
	const [sessions, setSessions] = useState<Session[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [running, setRunning] = useState(false);
	const [connected, setConnected] = useState(false);
	const [status, setStatus] = useState("准备连接 omp…");
	const [stderrLog, setStderrLog] = useState<string[]>([]);
	const [showSettings, setShowSettings] = useState(false);
	const [settings, setSettingsState] = useState({ ompCliPath: "", bunPath: "", cwd: "", theme: "light" as "light" | "dark" });
	const [permission, setPermission] = useState<{
		title: string;
		options: Array<{ optionId: string; name: string; kind: string }>;
		respond: (r: unknown) => void;
	} | null>(null);
	const [docs, setDocs] = useState<DocFile[]>(DEFAULT_DOCS);
	const [activeDoc, setActiveDoc] = useState("README.md");

	const scrollRef = useRef<HTMLDivElement>(null);
	const toolIndex = useRef<Map<string, number>>(new Map());

	const appendBlock = useCallback((sessionId: string, block: ContentBlock, toolCallId?: string) => {
		setMessages((prev) => {
			const last = prev[prev.length - 1];
			if (last?.role === "agent" && !toolCallId) {
				const copy = [...prev];
				copy[copy.length - 1] = { ...last, blocks: [...last.blocks, block] };
				return copy;
			}
			const msg: ChatMessage = { id: uid(), role: "agent", blocks: [block], ts: Date.now() };
			if (toolCallId) toolIndex.current.set(toolCallId, prev.length);
			return [...prev, msg];
		});
	}, []);

	const updateToolStatus = useCallback((toolCallId: string, status: "completed" | "failed", result?: string) => {
		const idx = toolIndex.current.get(toolCallId);
		if (idx === undefined) return;
		setMessages((prev) => {
			const copy = [...prev];
			const msg = copy[idx];
			if (!msg) return prev;
			const blocks = msg.blocks.map((b) =>
				b.toolName && b.text === toolCallId ? { ...b, status, text: result || b.text } : b,
			);
			copy[idx] = { ...msg, blocks };
			return copy;
		});
	}, []);

	const handleEvent = useCallback(
		(e: AcpEvent) => {
			if (e.type === "notification") {
				const p = e.params as Record<string, unknown>;
				if (e.method === "session/update") {
					const u = p.update as Record<string, unknown>;
					if (!u) return;
					const kind = u.sessionUpdate as string;
					const content = u.content as { type?: string; text?: string } | undefined;
					if (kind === "agent_message_chunk" && content?.text) {
						appendBlock(p.sessionId as string, { type: "text", text: content.text });
					} else if (kind === "agent_thought_chunk" && content?.text) {
						appendBlock(p.sessionId as string, { type: "thinking", text: content.text });
					} else if (kind === "tool_call") {
						const id = u.toolCallId as string;
						appendBlock(p.sessionId as string, {
							type: "tool_call",
							text: id,
							toolName: (u.title as string) || (u.kind as string) || "tool",
							status: "pending",
							raw: u,
						}, id);
					} else if (kind === "tool_call_update") {
						const id = u.toolCallId as string;
						const st = u.status as string;
						if (st === "completed" || st === "failed") {
							const c = u.content as { text?: string } | undefined;
							updateToolStatus(id, st === "completed" ? "completed" : "failed", c?.text);
						}
					}
				}
			} else if (e.type === "server_request") {
				const p = e.params as Record<string, unknown>;
				if (e.method === "session/request_permission") {
					const tc = p.toolCall as { title?: string } | undefined;
					setPermission({
						title: tc?.title || "请求执行操作",
						options: (p.options as Array<{ optionId: string; name: string; kind: string }>) || [],
						respond: e.respond,
					});
				} else if (e.method === "fs/read_text_file") {
					e.respond({ content: "" });
				} else if (e.method === "fs/write_text_file") {
					e.respond({});
				} else if (e.method === "terminal/create") {
					e.respond({ terminalId: uid() });
				} else if (e.method === "terminal/output") {
					e.respond({ output: "", truncated: false });
				} else if (e.method === "terminal/wait_for_exit") {
					e.respond({ exitCode: 0 });
				} else if (e.method === "terminal/kill" || e.method === "terminal/release") {
					e.respond({});
				} else {
					e.respond({});
				}
			}
		},
		[appendBlock, updateToolStatus],
	);

	useEffect(() => {
		const bridge = window.desktop;
		if (!bridge) {
			setStatus("错误：preload 未注入 window.desktop");
			return;
		}
		bridge.settings.get().then((s) => setSettingsState(s as typeof settings));
		bridge.onStderr((t) => setStderrLog((prev) => [...prev.slice(-50), t]));
		bridge.onExit(() => {
			setConnected(false);
			setRunning(false);
			setStatus("omp 已退出");
		});

		const c = new AcpClient(bridge);
		c.onEvent(handleEvent);
		setClient(c);

		(async () => {
			const r = await c.start();
			if (!r.ok) {
				setStatus(`启动失败：${r.error}`);
				return;
			}
			setStatus("握手中…");
			try {
				await c.initialize();
				const s = await bridge.settings.get();
				const sess = await c.newSession((s as typeof settings).cwd);
				setSessions([{ id: sess.sessionId, title: "如何对 omp-desktop 项目进行二次开发" }]);
				setActiveId(sess.sessionId);
				setConnected(true);
				setStatus("已连接");
			} catch (err) {
				setStatus(`握手失败：${(err as Error).message}`);
			}
		})();

		return () => c.stop();
	}, [handleEvent]);

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
	}, [messages, permission]);

	const send = async () => {
		if (!client || !activeId || !input.trim() || running) return;
		const text = input.trim();
		setInput("");
		setMessages((prev) => [...prev, { id: uid(), role: "user", blocks: [{ type: "text", text }], ts: Date.now() }]);
		setRunning(true);
		try {
			await client.prompt(activeId, text);
		} catch (err) {
			setMessages((prev) => [
				...prev,
				{ id: uid(), role: "system", blocks: [{ type: "text", text: `[错误] ${(err as Error).message}` }], ts: Date.now() },
			]);
		} finally {
			setRunning(false);
		}
	};

	const newSession = async () => {
		if (!client) return;
		try {
			const s = await window.desktop.settings.get();
			const sess = await client.newSession((s as typeof settings).cwd);
			setSessions((prev) => [...prev, { id: sess.sessionId, title: `新任务 ${prev.length + 1}` }]);
			setActiveId(sess.sessionId);
			setMessages([]);
		} catch (err) {
			setStatus(`新建会话失败：${(err as Error).message}`);
		}
	};

	const saveSettings = async () => {
		await window.desktop.settings.set(settings);
		setShowSettings(false);
		setStatus("设置已保存，重启后生效");
	};

	const openDoc = (name: string, content: string) => {
		setDocs((prev) => (prev.some((d) => d.name === name) ? prev : [...prev, { name, content }]));
		setActiveDoc(name);
	};

	return (
		<div className={`wb-app theme-${settings.theme}`}>
			<header className="wb-titlebar">
				<div className="wb-traffic">
					<span className="traffic red" />
					<span className="traffic yellow" />
					<span className="traffic green" />
				</div>
				<div className="wb-titlebar-center">OMP Desktop</div>
				<div className="wb-titlebar-right">
					<span className={`wb-conn ${connected ? "on" : "off"}`} title={status} />
					<span className="wb-status-text">{status}</span>
					<button onClick={() => setShowSettings(true)} title="设置">⚙</button>
				</div>
			</header>

			<div className="wb-workspace">
				<aside className="wb-sidebar">
					<div className="wb-brand">
						<span className="wb-brand-logo">◈</span>
						<span className="wb-brand-name">OMP Desktop</span>
					</div>
					<nav className="wb-nav">
						<button className="wb-nav-item primary" onClick={newSession}><span>＋</span> 新建任务</button>
						<button className="wb-nav-item"><span>☰</span> 规划任务</button>
						<button className="wb-nav-item"><span>◈</span> 专家与连接器</button>
						<button className="wb-nav-item"><span>◇</span> 发现</button>
						<button className="wb-nav-item"><span>▤</span> 资料库</button>
					</nav>
					<div className="wb-recent-label">最近</div>
					<div className="wb-recent-list">
						{sessions.map((s) => (
							<button
								key={s.id}
								className={`wb-recent-item ${s.id === activeId ? "active" : ""}`}
								onClick={() => { setActiveId(s.id); }}
								title={s.title}
							>
								<span className="wb-recent-icon">◱</span>
								<span>{s.title}</span>
							</button>
						))}
					</div>
					<div className="wb-sidebar-foot">
						<span className="wb-avatar">Hao</span>
						<span className="wb-user-name">Hao</span>
						<span className="wb-user-menu">⋯</span>
					</div>
				</aside>

				<div className="wb-center">
					<div className="wb-tabbar">
						<div className="wb-tab active"><span>◱</span> 会话</div>
						{docs.map((d) => (
							<div key={d.name} className={`wb-tab ${activeDoc === d.name ? "doc-active" : ""}`} onClick={() => setActiveDoc(d.name)}>
								<span>{d.name.endsWith(".md") ? "▤" : "⌗"}</span> {d.name}
							</div>
						))}
						<button className="wb-share" title="分享">↗ 分享</button>
					</div>

					<div className="wb-panels">
						<main className="wb-chat">
							<div className="wb-chat-head">
								<span className="wb-chat-title">{sessions.find((s) => s.id === activeId)?.title || "新任务"}</span>
								<div className="wb-chat-actions">
									<button title="搜索">⌕</button>
									<button title="更多">⋯</button>
								</div>
							</div>
							<div className="wb-messages" ref={scrollRef}>
								{messages.length === 0 && (
									<div className="wb-empty">
										<div className="wb-empty-logo">◈</div>
										<h2>OMP Desktop</h2>
										<p>WorkBuddy 风格的 omp 图形工作台，基于 ACP 协议</p>
										<p className="muted">在下方输入任务，omp 会通过工具调用并在界面中呈现</p>
									</div>
								)}
								{messages.map((m) => (
									<div key={m.id} className={`wb-msg ${m.role}`}>
										<div className="wb-msg-head">
											<span className="wb-msg-avatar">{m.role === "user" ? "我" : m.role === "agent" ? "◈" : "!"}</span>
											<span className="wb-msg-role">{m.role === "user" ? "你" : m.role === "agent" ? "omp" : "系统"}</span>
										</div>
										<div className="wb-msg-body">
											{m.blocks.map((b, i) => <Block key={i} block={b} onOpenDoc={openDoc} />)}
										</div>
									</div>
								))}
								{running && <div className="wb-typing">omp 正在思考<span className="dots">…</span></div>}
							</div>
							<div className="wb-composer">
								<textarea
									value={input}
									onChange={(e) => setInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
									}}
									placeholder={connected ? "给 omp 下达任务…  @ 引用文件" : "等待连接 omp…"}
									disabled={!connected || running}
								/>
								<div className="wb-composer-foot">
									<div className="wb-composer-tools">
										<button title="添加">＋</button>
										<button title="引用文件">@</button>
										<button title="工具">⚒</button>
										<span className="wb-model">Hy4 flash ▾</span>
									</div>
									<button className="wb-send" onClick={send} disabled={!connected || running || !input.trim()}>
										{running ? "运行中" : "发送 ▲"}
									</button>
								</div>
							</div>
							<div className="wb-chat-footnote">内容由 AI 生成，请仔细甄别 · <span className="wb-branch">main</span></div>
						</main>

						<section className="wb-docpanel">
							<div className="wb-doc-files">
								{docs.map((d) => (
									<div key={d.name} className={`wb-doc-file ${activeDoc === d.name ? "active" : ""}`} onClick={() => setActiveDoc(d.name)}>
										<span>{d.name.endsWith(".md") ? "▤" : "⌗"}</span> {d.name}
									</div>
								))}
							</div>
							<div className="wb-doc-content">
								{docs.filter((d) => d.name === activeDoc).map((d) => (
									<pre key={d.name} className="wb-doc-pre">{d.content}</pre>
								))}
							</div>
						</section>
					</div>
				</div>
			</div>

			{permission && (
				<div className="wb-modal-backdrop">
					<div className="wb-modal">
						<h3>权限确认</h3>
						<p>omp 请求执行以下操作：</p>
						<div className="wb-perm-title">{permission.title}</div>
						<div className="wb-perm-actions">
							{permission.options.map((o) => (
								<button
									key={o.optionId}
									className={o.kind === "reject" ? "reject" : "approve"}
									onClick={() => { permission.respond({ outcome: { outcome: "selected", optionId: o.optionId } }); setPermission(null); }}
								>
									{o.name}
								</button>
							))}
						</div>
					</div>
				</div>
			)}

			{showSettings && (
				<div className="wb-modal-backdrop">
					<div className="wb-modal settings">
						<h3>设置</h3>
						<label>omp CLI 路径<input value={settings.ompCliPath} onChange={(e) => setSettingsState({ ...settings, ompCliPath: e.target.value })} /></label>
						<label>bun 路径<input value={settings.bunPath} onChange={(e) => setSettingsState({ ...settings, bunPath: e.target.value })} /></label>
						<label>工作目录<input value={settings.cwd} onChange={(e) => setSettingsState({ ...settings, cwd: e.target.value })} /></label>
						<label>主题
							<select value={settings.theme} onChange={(e) => setSettingsState({ ...settings, theme: e.target.value as "light" | "dark" })}>
								<option value="light">浅色</option>
								<option value="dark">深色</option>
							</select>
						</label>
						<div className="wb-perm-actions">
							<button className="reject" onClick={() => setShowSettings(false)}>取消</button>
							<button className="approve" onClick={saveSettings}>保存</button>
						</div>
					</div>
				</div>
			)}

			{stderrLog.length > 0 && (
				<details className="wb-stderr">
					<summary>omp 日志（{stderrLog.length}）</summary>
					<pre>{stderrLog.join("")}</pre>
				</details>
			)}
		</div>
	);
}

function Block({ block, onOpenDoc }: { block: ContentBlock; onOpenDoc: (name: string, content: string) => void }) {
	if (block.type === "thinking") {
		return <details className="wb-thinking"><summary>thinking</summary><pre>{block.text}</pre></details>;
	}
	if (block.type === "tool_call") {
		return (
			<div className={`wb-tool-card ${block.status || "pending"}`}>
				<span className="wb-tool-status">{block.status === "completed" ? "✓" : block.status === "failed" ? "✗" : "◌"}</span>
				<span className="wb-tool-name">{block.toolName}</span>
				{block.status && block.status !== "pending" && block.text !== (block.raw as Record<string, unknown>)?.toolCallId && (
					<pre className="wb-tool-result">{block.text}</pre>
				)}
			</div>
		);
	}
	return <div className="wb-text-block" onDoubleClick={() => onOpenDoc("untitled.md", block.text)}>{block.text}</div>;
}
