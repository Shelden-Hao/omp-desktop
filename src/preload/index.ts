import { contextBridge, ipcRenderer } from "electron";
import type {
	AuditEntry,
	CustomModelState,
	DesktopSettings,
	McpConfigInfo,
	ModelContextInfo,
	ModelInputData,
	OmpConfigData,
	OpenedFile,
	RuntimeInfo,
	SkillCommandReply,
	SkillListData,
	SkillScope,
	SkillPathsData,
	SkillSearchData,
	SkillUpdateSummary,
	SkillsReply,
	StoredSession,
	SystemInfoData,
	ToolResult,
} from "../renderer/acp-client";

export interface DesktopBridge {
	settings: {
		get(): Promise<DesktopSettings>;
		set(next: Partial<DesktopSettings>): Promise<DesktopSettings & { ompSyncError?: string }>;
	};
	sessions: {
		get(): Promise<StoredSession[]>;
		set(next: StoredSession[]): Promise<StoredSession[]>;
	};
	models: {
		context(): Promise<ModelContextInfo[]>;
		list(): Promise<CustomModelState>;
		save(input: ModelInputData): Promise<CustomModelState>;
		remove(provider: string, id: string): Promise<CustomModelState>;
		test(input: { baseUrl: string; apiKey: string; model: string }): Promise<{
			ok: boolean;
			status?: number;
			message: string;
		}>;
		setRole(role: string, value: string): Promise<{ ok: boolean; error?: string }>;
	};
	omp: {
		config(): Promise<OmpConfigData>;
		setConfig(entries: Array<[string, string]>): Promise<{ ok: boolean; error?: string }>;
	};
	audit: {
		list(): Promise<AuditEntry[]>;
		add(entry: Partial<AuditEntry>): Promise<AuditEntry>;
		clear(): Promise<{ ok: boolean }>;
		export(): Promise<{ ok: boolean; path?: string; error?: string }>;
	};
	files: {
		open(): Promise<OpenedFile | null>;
		read(path: string): Promise<OpenedFile>;
	};
	mcp: {
		list(): Promise<McpConfigInfo>;
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
		updateAll(): Promise<SkillUpdateSummary>;
	};
	system: {
		info(): Promise<SystemInfoData>;
		openPath(path: string): Promise<{ ok: boolean; error?: string }>;
		pickDirectory(): Promise<string | null>;
		runtimes(): Promise<RuntimeInfo[]>;
	};
	links: {
		open(url: string): Promise<void>;
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
		list: () => ipcRenderer.invoke("models:list"),
		save: (input) => ipcRenderer.invoke("models:save", input),
		remove: (provider, id) => ipcRenderer.invoke("models:remove", provider, id),
		test: (input) => ipcRenderer.invoke("models:test", input),
		setRole: (role, value) => ipcRenderer.invoke("models:set-role", role, value),
	},
	omp: {
		config: () => ipcRenderer.invoke("omp:config"),
		setConfig: (entries) => ipcRenderer.invoke("omp:set-config", entries),
	},
	audit: {
		list: () => ipcRenderer.invoke("audit:list"),
		add: (entry) => ipcRenderer.invoke("audit:add", entry),
		clear: () => ipcRenderer.invoke("audit:clear"),
		export: () => ipcRenderer.invoke("audit:export"),
	},
	files: {
		open: () => ipcRenderer.invoke("file:open"),
		read: (path) => ipcRenderer.invoke("file:read", path),
	},
	mcp: {
		list: () => ipcRenderer.invoke("mcp:list"),
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
		updateAll: () => ipcRenderer.invoke("skills:update-all"),
	},
	system: {
		info: () => ipcRenderer.invoke("system:info"),
		openPath: (path) => ipcRenderer.invoke("system:open-path", path),
		pickDirectory: () => ipcRenderer.invoke("system:pick-directory"),
		runtimes: () => ipcRenderer.invoke("system:runtimes"),
	},
	links: {
		open: (url) => ipcRenderer.invoke("links:open", url),
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
