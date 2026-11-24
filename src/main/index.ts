import { spawn, type ChildProcess } from "node:child_process";
import { app, BrowserWindow, ipcMain } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// 配置：全部可改，默认自动探测本机已安装的 bun + omp
// ---------------------------------------------------------------------------

interface AppSettings {
	ompCliPath: string;
	bunPath: string;
	cwd: string;
	theme: "light" | "dark";
}

const SETTINGS_PATH = join(app.getPath("userData"), "settings.json");

function defaultSettings(): AppSettings {
	const home = homedir();
	const npmGlobal = app.isPackaged
		? join(home, "AppData", "Roaming", "npm")
		: process.env.npm_config_prefix || join(home, "AppData", "Roaming", "npm");
	return {
		ompCliPath: join(home, ".bun", "install", "global", "node_modules", "@oh-my-pi", "pi-coding-agent", "dist", "cli.js"),
		bunPath: join(npmGlobal, "bun", "bin", "bun.exe"),
		cwd: join(home, "Desktop"),
		theme: "dark",
	};
}

function loadSettings(): AppSettings {
	const defaults = defaultSettings();
	try {
		if (existsSync(SETTINGS_PATH)) {
			return { ...defaults, ...JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) };
		}
	} catch {
		// 配置损坏时回退默认值
	}
	return defaults;
}

function saveSettings(next: AppSettings) {
	mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
	writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2), "utf8");
}

let settings = loadSettings();

// ---------------------------------------------------------------------------
// ACP 子进程：spawn omp acp，stdin/stdout 走 NDJSON JSON-RPC
// ---------------------------------------------------------------------------

let agent: ChildProcess | null = null;
let stdoutBuffer = "";

function sendToRenderer(channel: string, payload: string) {
	for (const win of BrowserWindow.getAllWindows()) {
		win.webContents.send(channel, payload);
	}
}

function startAgent(): { ok: boolean; error?: string } {
	stopAgent();
	stdoutBuffer = "";

	if (!existsSync(settings.bunPath)) {
		return { ok: false, error: `找不到 bun：${settings.bunPath}` };
	}
	if (!existsSync(settings.ompCliPath)) {
		return { ok: false, error: `找不到 omp CLI：${settings.ompCliPath}` };
	}
	if (!existsSync(settings.cwd)) {
		mkdirSync(settings.cwd, { recursive: true });
	}

	try {
		agent = spawn(settings.bunPath, [settings.ompCliPath, "acp"], {
			cwd: settings.cwd,
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
	} catch (e) {
		return { ok: false, error: `启动 omp 失败：${(e as Error).message}` };
	}

	agent.stdout?.setEncoding("utf8");
	agent.stdout?.on("data", (chunk: string) => {
		stdoutBuffer += chunk;
		let idx: number;
		while ((idx = stdoutBuffer.indexOf("\n")) >= 0) {
			const line = stdoutBuffer.slice(0, idx).trim();
			stdoutBuffer = stdoutBuffer.slice(idx + 1);
			if (line) sendToRenderer("acp:frame", line);
		}
	});

	agent.stderr?.setEncoding("utf8");
	agent.stderr?.on("data", (chunk: string) => {
		sendToRenderer("acp:stderr", chunk);
	});

	agent.on("exit", (code) => {
		sendToRenderer("acp:exit", String(code ?? 0));
		agent = null;
	});

	agent.on("error", (e) => {
		sendToRenderer("acp:stderr", `[spawn error] ${e.message}`);
	});

	return { ok: true };
}

function stopAgent() {
	if (agent) {
		agent.stdin?.end();
		agent.kill();
		agent = null;
	}
}

// ---------------------------------------------------------------------------
// Electron 生命周期
// ---------------------------------------------------------------------------

function createWindow() {
	const win = new BrowserWindow({
		width: 1280,
		height: 820,
		minWidth: 900,
		minHeight: 600,
		title: "OMP Desktop",
		webPreferences: {
			preload: join(__dirname, "..", "preload", "index.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	const devUrl = process.env.VITE_DEV_URL;
	if (devUrl) {
		win.loadURL(devUrl);
	} else {
		win.loadFile(join(__dirname, "..", "renderer", "index.html"));
	}
}

app.whenReady().then(() => {
	ipcMain.handle("settings:get", () => settings);
	ipcMain.handle("settings:set", (_e, next: AppSettings) => {
		settings = { ...settings, ...next };
		saveSettings(settings);
		return settings;
	});
	ipcMain.handle("agent:start", () => startAgent());
	ipcMain.handle("agent:stop", () => {
		stopAgent();
		return { ok: true };
	});
	ipcMain.handle("agent:status", () => ({ running: agent !== null }));
	ipcMain.handle("agent:send", (_e, line: string) => {
		if (!agent?.stdin?.writable) return { ok: false, error: "omp 未运行" };
		agent.stdin.write(line + "\n");
		return { ok: true };
	});

	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	stopAgent();
	if (process.platform !== "darwin") app.quit();
});
