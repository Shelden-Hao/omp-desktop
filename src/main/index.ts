import { spawn, type ChildProcess } from "node:child_process";
import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from "electron";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// 配置：全部可改，默认自动探测本机已安装的 bun + omp
// ---------------------------------------------------------------------------

interface AppSettings {
	ompCliPath: string;
	bunPath: string;
	cwd: string;
	theme: "light" | "dark" | "system";
}

interface TextDocument {
	path: string;
	name: string;
	content: string;
	language: string;
}

const SETTINGS_PATH = join(app.getPath("userData"), "settings.json");
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
	js: "javascript",
	jsx: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	ts: "typescript",
	tsx: "typescript",
	json: "json",
	jsonc: "json",
	md: "markdown",
	mdx: "markdown",
	css: "css",
	scss: "css",
	less: "css",
	html: "html",
	htm: "html",
	vue: "vue",
	py: "python",
	rb: "ruby",
	go: "go",
	rs: "rust",
	java: "java",
	kt: "kotlin",
	c: "c",
	h: "c",
	cpp: "cpp",
	hpp: "cpp",
	cs: "csharp",
	php: "php",
	sh: "shell",
	bash: "shell",
	ps1: "powershell",
	yml: "yaml",
	yaml: "yaml",
	toml: "toml",
	ini: "ini",
	sql: "sql",
	env: "text",
	txt: "text",
};

function languageFor(fileName: string) {
	const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() || "" : "";
	return LANGUAGE_BY_EXTENSION[ext] || "text";
}

function readTextDocument(filePath: string): TextDocument {
	const stat = statSync(filePath);
	if (!stat.isFile()) throw new Error("路径不是文件");
	if (stat.size > MAX_PREVIEW_BYTES) throw new Error("文件超过 2 MB，未载入预览");

	const buffer = readFileSync(filePath);
	if (buffer.includes(0)) throw new Error("文件包含二进制内容，未载入预览");

	return {
		path: filePath,
		name: basename(filePath),
		content: buffer.toString("utf8"),
		language: languageFor(filePath),
	};
}

function defaultSettings(): AppSettings {
	const home = homedir();
	const npmGlobal = app.isPackaged
		? join(home, "AppData", "Roaming", "npm")
		: process.env.npm_config_prefix || join(home, "AppData", "Roaming", "npm");
	return {
		ompCliPath: join(home, ".bun", "install", "global", "node_modules", "@oh-my-pi", "pi-coding-agent", "dist", "cli.js"),
		bunPath: join(npmGlobal, "bun", "bin", "bun.exe"),
		cwd: join(home, "Desktop"),
		theme: "system",
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
nativeTheme.themeSource = settings.theme === "system" ? "system" : settings.theme;

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
	ipcMain.handle("settings:set", (_e, next: Partial<AppSettings>) => {
		const requestedTheme = next.theme;
		const theme =
			requestedTheme === "light" || requestedTheme === "dark" || requestedTheme === "system"
				? requestedTheme
				: settings.theme;
		settings = { ...settings, ...next, theme };
		nativeTheme.themeSource = theme === "system" ? "system" : theme;
		saveSettings(settings);
		return settings;
	});
	ipcMain.handle("file:open", async () => {
		const result = await dialog.showOpenDialog({
			title: "选择要预览的文件",
			properties: ["openFile"],
			filters: [
				{
					name: "文本与代码文件",
					extensions: ["js", "jsx", "mjs", "cjs", "ts", "tsx", "json", "jsonc", "md", "mdx", "css", "scss", "less", "html", "htm", "vue", "py", "rb", "go", "rs", "java", "kt", "c", "h", "cpp", "hpp", "cs", "php", "sh", "bash", "ps1", "yml", "yaml", "toml", "ini", "sql", "txt", "env"],
				},
				{ name: "所有文件", extensions: ["*"] },
			],
		});
		if (result.canceled || result.filePaths.length === 0) return null;
		return readTextDocument(result.filePaths[0]);
	});

	ipcMain.handle("file:read", (_e, filePath: string) => readTextDocument(filePath));

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
