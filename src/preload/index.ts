import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../shared/bridge";

const bridge: DesktopBridge = {
	settings: {
		get: () => ipcRenderer.invoke("settings:get"),
		set: (next) => ipcRenderer.invoke("settings:set", next),
	},
	sessions: {
		get: () => ipcRenderer.invoke("sessions:get"),
		set: (next) => ipcRenderer.invoke("sessions:set", next),
	},
	workspaces: {
		get: () => ipcRenderer.invoke("workspaces:get"),
		set: (next) => ipcRenderer.invoke("workspaces:set", next),
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
