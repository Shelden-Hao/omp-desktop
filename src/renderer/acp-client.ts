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

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

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
		return this.request("session/new", { cwd, mcpServers: [] }) as Promise<{ sessionId: string }>;
	}

	async loadSession(sessionId: string, cwd: string) {
		return this.request("session/load", { sessionId, cwd, mcpServers: [] });
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
