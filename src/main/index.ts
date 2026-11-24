import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from "electron";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

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
const SESSIONS_PATH = join(app.getPath("userData"), "sessions.json");
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

let settings = loadSettings();
nativeTheme.themeSource = settings.theme === "system" ? "system" : settings.theme;

interface ToolResult {
	ok: boolean;
	result?: unknown;
	error?: string;
}

function toolOk(result: unknown = {}): ToolResult {
	return { ok: true, result };
}

function toolFail(error: unknown): ToolResult {
	return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

function resolveWorkspacePath(input: string): string {
	const root = resolve(settings.cwd);
	const target = resolve(isAbsolute(input) ? input : join(root, input));
	const rootKey = root.toLowerCase();
	const targetKey = target.toLowerCase();
	if (targetKey !== rootKey && !targetKey.startsWith(`${rootKey}${sep.toLowerCase()}`)) {
		throw new Error("路径超出工作目录");
	}
	return target;
}

function resolveExistingPath(input: string): string {
	const candidate = resolveWorkspacePath(input);
	if (!existsSync(candidate)) return candidate;
	try {
		const real = resolve(realpathSync(candidate));
		const realKey = real.toLowerCase();
		const rootKey = resolve(settings.cwd).toLowerCase();
		if (realKey !== rootKey && !realKey.startsWith(`${rootKey}${sep.toLowerCase()}`)) {
			throw new Error("路径超出工作目录");
		}
		return real;
	} catch (error) {
		if (error instanceof Error && error.message === "路径超出工作目录") throw error;
		return candidate;
	}
}

function acpFsRead(params: Record<string, unknown>): ToolResult {
	try {
		if (typeof params.path !== "string" || !params.path) throw new Error("缺少文件路径");
		const filePath = resolveExistingPath(params.path);
		const document = readTextDocument(filePath);
		const line = typeof params.line === "number" && params.line > 0 ? params.line : 1;
		const limit = typeof params.limit === "number" && params.limit > 0 ? params.limit : undefined;
		let content = document.content;
		if (line > 1 || limit !== undefined) {
			const lines = content.split(/\r?\n/);
			content = lines.slice(line - 1, limit ? line - 1 + limit : undefined).join("\n");
		}
		return toolOk({ content });
	} catch (error) {
		return toolFail(error);
	}
}

function acpFsWrite(params: Record<string, unknown>): ToolResult {
	try {
		if (typeof params.path !== "string" || !params.path) throw new Error("缺少文件路径");
		if (typeof params.content !== "string") throw new Error("文件内容必须是文本");
		const filePath = resolveWorkspacePath(params.path);
		const contentBytes = Buffer.byteLength(params.content, "utf8");
		if (contentBytes > MAX_PREVIEW_BYTES) throw new Error("单次写入超过 2 MB");
		mkdirSync(dirname(filePath), { recursive: true });
		writeFileSync(filePath, params.content, "utf8");
		return toolOk();
	} catch (error) {
		return toolFail(error);
	}
}

interface TerminalSession {
	id: string;
	child: ChildProcess;
	output: string;
	truncated: boolean;
	limit: number;
	exitCode: number | null;
	signal: string | null;
	waiters: Array<() => void>;
}

const terminals = new Map<string, TerminalSession>();

function terminalStatus(session: TerminalSession) {
	return session.exitCode === null && session.signal === null
		? null
		: { exitCode: session.exitCode, signal: session.signal };
}

function appendTerminalOutput(session: TerminalSession, chunk: string) {
	session.output += chunk;
	const bytes = Buffer.byteLength(session.output, "utf8");
	if (bytes <= session.limit) return;
	const buffer = Buffer.from(session.output, "utf8");
	let text = buffer.subarray(buffer.length - session.limit).toString("utf8");
	while (text.startsWith("\uFFFD")) text = text.slice(1);
	session.output = text;
	session.truncated = true;
}

function markTerminalExited(session: TerminalSession, exitCode: number | null, signal: string | null) {
	session.exitCode = exitCode;
	session.signal = signal;
	for (const resolveWaiter of session.waiters) resolveWaiter();
	session.waiters = [];
}

function terminateTerminal(session: TerminalSession) {
	if (session.exitCode === null && session.signal === null) session.child.kill();
}

function releaseAllTerminals() {
	for (const session of terminals.values()) terminateTerminal(session);
	terminals.clear();
}

function acpTerminalCreate(params: Record<string, unknown>): ToolResult {
	try {
		if (typeof params.command !== "string" || !params.command) throw new Error("缺少命令");
		const args = Array.isArray(params.args) ? params.args.filter((item): item is string => typeof item === "string") : [];
		const workspace = resolve(settings.cwd);
		const cwd = typeof params.cwd === "string" && params.cwd ? resolveWorkspacePath(params.cwd) : workspace;
		const env: NodeJS.ProcessEnv = { ...process.env };
		delete env.ELECTRON_RUN_AS_NODE;
		if (Array.isArray(params.env)) {
			for (const item of params.env) {
				if (item && typeof item === "object" && typeof item.name === "string" && typeof item.value === "string") {
					env[item.name] = item.value;
				}
			}
		}
		const limit =
			typeof params.outputByteLimit === "number" && params.outputByteLimit > 0
				? params.outputByteLimit
				: 1024 * 1024;

		const child = spawn(params.command, args, {
			cwd,
			env,
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const session: TerminalSession = {
			id: randomUUID(),
			child,
			output: "",
			truncated: false,
			limit,
			exitCode: null,
			signal: null,
			waiters: [],
		};
		terminals.set(session.id, session);

		child.stdout?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => appendTerminalOutput(session, chunk));
		child.stderr?.setEncoding("utf8");
		child.stderr?.on("data", (chunk: string) => appendTerminalOutput(session, chunk));
		child.on("error", (error) => {
			appendTerminalOutput(session, `[spawn error] ${error.message}\n`);
			markTerminalExited(session, 1, null);
		});
		child.on("close", (code, signal) => markTerminalExited(session, code, signal));

		return toolOk({ terminalId: session.id });
	} catch (error) {
		return toolFail(error);
	}
}

function requireTerminal(params: Record<string, unknown>): TerminalSession {
	if (typeof params.terminalId !== "string") throw new Error("缺少终端 ID");
	const session = terminals.get(params.terminalId);
	if (!session) throw new Error("终端不存在或已释放");
	return session;
}

function acpTerminalOutput(params: Record<string, unknown>): ToolResult {
	try {
		const session = requireTerminal(params);
		return toolOk({
			output: session.output,
			truncated: session.truncated,
			exitStatus: terminalStatus(session),
		});
	} catch (error) {
		return toolFail(error);
	}
}

async function acpTerminalWait(params: Record<string, unknown>): Promise<ToolResult> {
	try {
		const session = requireTerminal(params);
		if (session.exitCode === null && session.signal === null) {
			await new Promise<void>((resolveWaiter) => session.waiters.push(resolveWaiter));
		}
		return toolOk({ exitCode: session.exitCode, signal: session.signal });
	} catch (error) {
		return toolFail(error);
	}
}

function acpTerminalKill(params: Record<string, unknown>): ToolResult {
	try {
		terminateTerminal(requireTerminal(params));
		return toolOk();
	} catch (error) {
		return toolFail(error);
	}
}

function acpTerminalRelease(params: Record<string, unknown>): ToolResult {
	try {
		const session = requireTerminal(params);
		terminateTerminal(session);
		terminals.delete(session.id);
		return toolOk();
	} catch (error) {
		return toolFail(error);
	}
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

interface StoredSession {
	id: string;
	title: string;
	cwd: string;
}

function loadSessions(): StoredSession[] {
	try {
		if (!existsSync(SESSIONS_PATH)) return [];
		const parsed: unknown = JSON.parse(readFileSync(SESSIONS_PATH, "utf8"));
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((item): item is StoredSession =>
				Boolean(item) &&
				typeof item === "object" &&
				typeof item.id === "string" &&
				typeof item.title === "string" &&
				typeof item.cwd === "string",
			)
			.map((item) => ({ id: item.id, title: item.title, cwd: item.cwd }));
	} catch {
		return [];
	}
}

function saveSessions(next: StoredSession[]) {
	mkdirSync(dirname(SESSIONS_PATH), { recursive: true });
	writeFileSync(SESSIONS_PATH, JSON.stringify(next, null, 2), "utf8");
}

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
	releaseAllTerminals();
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
	ipcMain.handle("sessions:get", () => loadSessions());
	ipcMain.handle("sessions:set", (_e, next: StoredSession[]) => {
		saveSessions(next);
		return next;
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

	const acpToolHandlers: Record<string, (params: Record<string, unknown>) => ToolResult | Promise<ToolResult>> = {
		"acp:fs-read": acpFsRead,
		"acp:fs-write": acpFsWrite,
		"acp:terminal-create": acpTerminalCreate,
		"acp:terminal-output": acpTerminalOutput,
		"acp:terminal-wait": acpTerminalWait,
		"acp:terminal-kill": acpTerminalKill,
		"acp:terminal-release": acpTerminalRelease,
	};
	for (const [channel, handler] of Object.entries(acpToolHandlers)) {
		ipcMain.handle(channel, (_e, params: Record<string, unknown>) => handler(params || {}));
	}

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
