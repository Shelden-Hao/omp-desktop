import { contextBridge, ipcRenderer } from "electron";
import type {
	DesktopSettings,
	OpenedFile,
	StoredSession,
	ToolResult,
} from "../renderer/acp-client";

export interface DesktopBridge {
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
	agent: {
		start(): Promise<{ ok: boolean; error?: string }>;
		stop(): Promise<{ ok: boolean }>;
		status(): Promise<{ running: boolean }>;
		send(line: string): Promise<{ ok: boolean; error?: string }>;
	};
	window: {
		minimize(): Promise<void>;
		maximize(): Promise<void>;
		close(): Promise<void>;
	};
	onFrame(cb: (line: string) => void): () => void;
	onStderr(cb: (text: string) => void): () => void;
	onExit(cb: (code: string) => void): () => void;
}

const bridge: DesktopBridge = {
	settings: {
		get: () => ipcRenderer.invoke("settings:get"),
		set: (next) => ipcRenderer.invoke("settings:set", next),
	},
	sessions: {
		get: () => ipcRenderer.invoke("sessions:get"),
		set: (next) => ipcRenderer.invoke("sessions:set", next),
	},
	files: {
		open: () => ipcRenderer.invoke("file:open"),
		read: (path) => ipcRenderer.invoke("file:read", path),
	},
	acpTools: {
		fsRead: (params) => ipcRenderer.invoke("acp:fs-read", params),
		fsWrite: (params) => ipcRenderer.invoke("acp:fs-write", params),
		terminalCreate: (params) => ipcRenderer.invoke("acp:terminal-create", params),
		terminalOutput: (params) => ipcRenderer.invoke("acp:terminal-output", params),
		terminalWait: (params) => ipcRenderer.invoke("acp:terminal-wait", params),
		terminalKill: (params) => ipcRenderer.invoke("acp:terminal-kill", params),
		terminalRelease: (params) => ipcRenderer.invoke("acp:terminal-release", params),
	},
	agent: {
		start: () => ipcRenderer.invoke("agent:start"),
		stop: () => ipcRenderer.invoke("agent:stop"),
		status: () => ipcRenderer.invoke("agent:status"),
		send: (line) => ipcRenderer.invoke("agent:send", line),
	},
	window: {
		minimize: () => ipcRenderer.invoke("window:minimize"),
		maximize: () => ipcRenderer.invoke("window:maximize"),
		close: () => ipcRenderer.invoke("window:close"),
	},
	onFrame: (cb) => {
		const fn = (_e: unknown, line: string) => cb(line);
		ipcRenderer.on("acp:frame", fn);
		return () => ipcRenderer.removeListener("acp:frame", fn);
	},
	onStderr: (cb) => {
		const fn = (_e: unknown, text: string) => cb(text);
		ipcRenderer.on("acp:stderr", fn);
		return () => ipcRenderer.removeListener("acp:stderr", fn);
	},
	onExit: (cb) => {
		const fn = (_e: unknown, code: string) => cb(code);
		ipcRenderer.on("acp:exit", fn);
		return () => ipcRenderer.removeListener("acp:exit", fn);
	},
};

contextBridge.exposeInMainWorld("desktop", bridge);
