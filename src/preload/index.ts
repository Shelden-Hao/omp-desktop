import { contextBridge, ipcRenderer } from "electron";
import type {
	DesktopSettings,
	ModelContextInfo,
	OpenedFile,
	SkillCommandReply,
	SkillListData,
	SkillScope,
	SkillPathsData,
	SkillSearchData,
	SkillsReply,
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
	models: {
		context(): Promise<ModelContextInfo[]>;
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
	skills: {
		list(cwd?: string): Promise<SkillsReply<SkillListData>>;
		search(
			query: string,
			sort: "relevance" | "downloads" | "recent",
		): Promise<SkillsReply<SkillSearchData>>;
		info(spec: string): Promise<SkillsReply<Record<string, unknown>>>;
		install(spec: string, scope: SkillScope): Promise<SkillCommandReply>;
		uninstall(name: string, scope: SkillScope): Promise<SkillCommandReply>;
		publish(dir: string, scope: string): Promise<SkillCommandReply>;
		config(key: string): Promise<SkillsReply<unknown>>;
		enabled(name: string, enabled: boolean): Promise<SkillsReply<void>>;
		paths(): Promise<SkillsReply<SkillPathsData>>;
		create(input: {
			name: string;
			description: string;
			scope: SkillScope;
		}): Promise<SkillsReply<{ path: string }>>;
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
	models: {
		context: () => ipcRenderer.invoke("models:context"),
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
	skills: {
		list: (cwd) => ipcRenderer.invoke("skills:list", cwd),
		search: (query, sort) => ipcRenderer.invoke("skills:search", query, sort),
		info: (spec) => ipcRenderer.invoke("skills:info", spec),
		install: (spec, scope) => ipcRenderer.invoke("skills:install", spec, scope),
		uninstall: (name, scope) => ipcRenderer.invoke("skills:uninstall", name, scope),
		publish: (dir, scope) => ipcRenderer.invoke("skills:publish", dir, scope),
		config: (key) => ipcRenderer.invoke("skills:config", key),
		enabled: (name, enabled) => ipcRenderer.invoke("skills:enabled", name, enabled),
		paths: () => ipcRenderer.invoke("skills:paths"),
		create: (input) => ipcRenderer.invoke("skills:create", input),
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
