/**
 * ACP (Agent Client Protocol) 客户端。
 * 直接基于 JSON-RPC 2.0 over NDJSON，不依赖 SDK 的具体版本 API，
 * 这样 omp 升级导致 SDK 变更时外壳不受影响。
 */

export type ThemeMode = "light" | "dark" | "system";

export interface DesktopSettings {
	ompCliPath: string;
	bunPath: string;
	cwd: string;
	theme: ThemeMode;
}

export interface StoredSession {
	id: string;
	title: string;
	cwd: string;
	ts?: number;
}

export interface OpenedFile {
	path: string;
	name: string;
	content: string;
	language: string;
}

export interface ToolResult {
	ok: boolean;
	result?: unknown;
	error?: string;
}

export interface AcpBridge {
	agent: {
		start(): Promise<{ ok: boolean; error?: string }>;
		stop(): Promise<{ ok: boolean }>;
		status(): Promise<{ running: boolean }>;
		send(line: string): Promise<{ ok: boolean; error?: string }>;
	};
	settings: {
		get(): Promise<DesktopSettings>;
		set(next: Partial<DesktopSettings>): Promise<DesktopSettings>;
	};
	sessions: {
		get(): Promise<StoredSession[]>;
		set(next: StoredSession[]): Promise<StoredSession[]>;
	};
	files: {
		open(): Promise<OpenedFile | null>;
		read(path: string): Promise<OpenedFile>;
	};
	acpTools: {
		fsRead(params: Record<string, unknown>): Promise<ToolResult>;
		fsWrite(params: Record<string, unknown>): Promise<ToolResult>;
		terminalCreate(params: Record<string, unknown>): Promise<ToolResult>;
		terminalOutput(params: Record<string, unknown>): Promise<ToolResult>;
		terminalWait(params: Record<string, unknown>): Promise<ToolResult>;
		terminalKill(params: Record<string, unknown>): Promise<ToolResult>;
		terminalRelease(params: Record<string, unknown>): Promise<ToolResult>;
	};
	onFrame(cb: (line: string) => void): () => void;
	onStderr(cb: (text: string) => void): () => void;
	onExit(cb: (code: string) => void): () => void;
}

declare global {
	interface Window {
		desktop: AcpBridge;
	}
}

export type Role = "user" | "agent" | "system";

export interface ContentBlock {
	type: "text" | "thinking" | "tool_call" | "tool_result" | "diff" | "other";
	text: string;
	toolName?: string;
	status?: "pending" | "completed" | "failed";
	raw?: unknown;
}

export interface ChatMessage {
	id: string;
	role: Role;
	blocks: ContentBlock[];
	ts: number;
	durationMs?: number;
}

export interface PermissionRequest {
	toolCallId: string;
	title: string;
	options: Array<{ optionId: string; name: string; kind: string }>;
}

/** ACP 会话模式（推理档位等） */
export interface SessionMode {
	id: string;
	name: string;
	description?: string | null;
}

export interface SessionModeState {
	currentModeId: string;
	availableModes: SessionMode[];
}

/** ACP 会话配置选项（模型选择等） */
export interface SessionConfigOption {
	id: string;
	name: string;
	description?: string | null;
	category?: "mode" | "model" | "model_config" | "thought_level" | string | null;
	type: "select" | "boolean";
	currentValue?: string;
	currentBoolean?: boolean;
	options?: Array<{ value: string; name: string; description?: string | null }>;
}

export interface SessionState {
	modes: SessionModeState | null;
	configOptions: SessionConfigOption[];
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** 把 ACP 原始 configOptions/modes 规范化，兼容不同 omp 版本的字段差异 */
export function normalizeSessionState(raw: unknown): SessionState {
	const source = asRecord(raw);
	const rawModes = source.modes;
	let modes: SessionModeState | null = null;
	if (rawModes && typeof rawModes === "object") {
		const m = rawModes as Record<string, unknown>;
		const available = Array.isArray(m.availableModes)
			? m.availableModes.map((item) => {
					const mode = asRecord(item);
					return {
						id: String(mode.id || ""),
						name: String(mode.name || mode.id || ""),
						description: typeof mode.description === "string" ? mode.description : null,
					};
				}).filter((mode) => mode.id)
			: [];
		modes = { currentModeId: String(m.currentModeId || ""), availableModes: available };
	}
	const configOptions = (Array.isArray(source.configOptions) ? source.configOptions : [])
		.map((item): SessionConfigOption | null => {
			const option = asRecord(item);
			const id = String(option.id || "");
			if (!id) return null;
			const type = option.type === "boolean" ? "boolean" : "select";
			const select = asRecord(option);
			const options = Array.isArray(select.options)
				? select.options.map((entry) => {
						const value = asRecord(entry);
						const grouped = Array.isArray(value.options) ? value.options : [];
						const flatten = grouped.length
							? grouped.map((g) => {
									const group = asRecord(g);
									return { value: String(group.value || ""), name: String(group.name || group.value || ""), description: typeof group.description === "string" ? group.description : null };
								})
							: [{ value: String(value.value || ""), name: String(value.name || value.value || ""), description: typeof value.description === "string" ? value.description : null }];
						return flatten;
					}).flat().filter((entry) => entry.value)
				: [];
			return {
				id,
				name: String(option.name || id),
				description: typeof option.description === "string" ? option.description : null,
				category: typeof option.category === "string" ? option.category : null,
				type,
				currentValue: typeof option.currentValue === "string" ? option.currentValue : options[0]?.value,
				currentBoolean: typeof option.currentValue === "boolean" ? option.currentValue : typeof option.currentBoolean === "boolean" ? option.currentBoolean : undefined,
				options,
			};
		})
		.filter((option): option is SessionConfigOption => Boolean(option));
	return { modes, configOptions };
}

export class AcpClient {
	private nextId = 1;
	private pending = new Map<number, Pending>();
	private offFrame: () => void = () => {};
	private listeners = new Set<(e: AcpEvent) => void>();

	constructor(private bridge: AcpBridge) {}

	/** 启动 omp 并注册帧监听 */
	async start(): Promise<{ ok: boolean; error?: string }> {
		const r = await this.bridge.agent.start();
		if (!r.ok) return r;
		this.offFrame = this.bridge.onFrame((line) => this.handleFrame(line));
		return r;
	}

	stop() {
		this.offFrame();
		for (const p of this.pending.values()) p.reject(new Error("agent stopped"));
		this.pending.clear();
		this.bridge.agent.stop();
	}

	onEvent(cb: (e: AcpEvent) => void): () => void {
		this.listeners.add(cb);
		return () => this.listeners.delete(cb);
	}

	private emit(e: AcpEvent) {
		for (const cb of this.listeners) cb(e);
	}

	/** 发请求，等待响应 */
	request(method: string, params: unknown): Promise<unknown> {
		const id = this.nextId++;
		const line = JSON.stringify({ jsonrpc: "2.0", id, method, params });
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.bridge.agent.send(line).then((r) => {
				if (!r.ok) {
					this.pending.delete(id);
					reject(new Error(r.error || "send failed"));
				}
			});
		});
	}

	/** 发通知（无响应） */
	notify(method: string, params: unknown) {
		this.bridge.agent.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
	}

	/** 响应 agent 发来的请求（权限、fs、terminal） */
	private respond(id: number, result: unknown, error?: { code: number; message: string }) {
		const payload: Record<string, unknown> = { jsonrpc: "2.0", id };
		if (error) payload.error = error;
		else payload.result = result;
		this.bridge.agent.send(JSON.stringify(payload));
	}

	private handleFrame(line: string) {
		let msg: Record<string, unknown>;
		try {
			msg = JSON.parse(line);
		} catch {
			return;
		}

		if (typeof msg.id === "number" && ("result" in msg || "error" in msg)) {
			const p = this.pending.get(msg.id);
			if (p) {
				this.pending.delete(msg.id);
				if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
				else p.resolve(msg.result);
			}
			return;
		}

		if (typeof msg.id === "number" && "method" in msg) {
			this.handleServerRequest(msg.id as number, msg.method as string, msg.params);
			return;
		}

		if ("method" in msg) {
			this.emit({ type: "notification", method: msg.method as string, params: msg.params });
		}
	}

	private handleServerRequest(id: number, method: string, params: unknown) {
		this.emit({
			type: "server_request",
			method,
			params,
			respond: (result) => this.respond(id, result),
			respondError: (code, message) => this.respond(id, undefined, { code, message }),
		});
	}

	// ---- 对外 ACP 方法 ----

	async initialize() {
		return this.request("initialize", {
			protocolVersion: 1,
			clientInfo: { name: "omp-desktop", version: "0.1.0" },
			clientCapabilities: {
				fs: { readTextFile: true, writeTextFile: true },
				terminal: true,
			},
		});
	}

	async newSession(cwd: string) {
		const raw = await this.request("session/new", { cwd, mcpServers: [] });
		return { ...asRecord(raw), sessionId: String(asRecord(raw).sessionId || "") } as { sessionId: string } & Record<string, unknown>;
	}

	async loadSession(sessionId: string, cwd: string) {
		return this.request("session/load", { sessionId, cwd, mcpServers: [] });
	}

	async setMode(sessionId: string, modeId: string) {
		return this.request("session/set_mode", { sessionId, modeId });
	}

	async setConfigOption(sessionId: string, configId: string, value: string | boolean) {
		const payload = typeof value === "boolean"
			? { type: "boolean", value }
			: { value };
		return this.request("session/set_config_option", { sessionId, configId, ...payload });
	}

	async listSessions() {
		return this.request("session/list", {}) as Promise<{ sessions: Array<{ sessionId: string; title?: string; cwd?: string }> }>;
	}

	async prompt(sessionId: string, text: string) {
		return this.request("session/prompt", {
			sessionId,
			prompt: [{ type: "text", text }],
		});
	}

	cancel(sessionId: string) {
		this.notify("session/cancel", { sessionId });
	}
}

export type AcpEvent =
	| { type: "notification"; method: string; params: unknown }
	| {
			type: "server_request";
			method: string;
			params: unknown;
			respond: (result: unknown) => void;
			respondError: (code: number, message: string) => void;
	  };
