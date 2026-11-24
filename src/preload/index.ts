import { contextBridge, ipcRenderer } from "electron";
import type { DesktopSettings } from "../renderer/acp-client";

export interface DesktopBridge {
	settings: {
		get(): Promise<DesktopSettings>;
		set(next: Partial<DesktopSettings>): Promise<DesktopSettings>;
	};
	agent: {
		start(): Promise<{ ok: boolean; error?: string }>;
		stop(): Promise<{ ok: boolean }>;
		status(): Promise<{ running: boolean }>;
		send(line: string): Promise<{ ok: boolean; error?: string }>;
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
	agent: {
		start: () => ipcRenderer.invoke("agent:start"),
		stop: () => ipcRenderer.invoke("agent:stop"),
		status: () => ipcRenderer.invoke("agent:status"),
		send: (line) => ipcRenderer.invoke("agent:send", line),
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
