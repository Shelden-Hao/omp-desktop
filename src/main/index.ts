import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from "electron";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { readModelContexts } from "./model-context";
import { listMcpServers } from "./mcp";
import {
	applyLoginItem,
	applyProxy,
	getSystemInfo,
	openLink,
	openPath,
	pickDirectory,
	syncPowerBlockers,
} from "./system";
import {
	createSkill,
	getSkillConfigValue,
	getSkillPaths,
	installSkill,
	listSkills,
	searchSkills,
	setSkillEnabled,
	showSkillInfo,
	publishSkill,
	runOmpCommand,
	skillCall,
	skillCommand,
	uninstallSkill,
} from "./skills";

// ---------------------------------------------------------------------------
// 配置：全部可改，默认自动探测本机已安装的 bun + omp
// ---------------------------------------------------------------------------

interface AppSettings {
	ompCliPath: string;
	bunPath: string;
	cwd: string;
	theme: "light" | "dark" | "system";
	/** 透传给 omp 的 --approval-mode，切换后需要重启 ACP 子进程才生效 */
	approvalMode: ApprovalMode;
	fontScale: number;
	linkOpenMode: "ask" | "browser" | "copy";
	keepAwakeOnLock: boolean;
	preventSystemSleep: boolean;
	openAtLogin: boolean;
	proxyMode: "direct" | "system" | "manual";
	proxyUrl: string;
	autoInstallTrustedSkills: boolean;
	autoUpdateSkills: boolean;
}

type ApprovalMode = "always-ask" | "always-ask-cached" | "write" | "yolo";

const APPROVAL_MODES: ApprovalMode[] = ["always-ask", "always-ask-cached", "write", "yolo"];

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

function markTerminalExited(
	session: TerminalSession,
	exitCode: number | null,
	signal: string | null,
) {
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
		const args = Array.isArray(params.args)
			? params.args.filter((item): item is string => typeof item === "string")
			: [];
		const workspace = resolve(settings.cwd);
		const cwd =
			typeof params.cwd === "string" && params.cwd ? resolveWorkspacePath(params.cwd) : workspace;
		const env: NodeJS.ProcessEnv = { ...process.env };
		delete env.ELECTRON_RUN_AS_NODE;
		if (Array.isArray(params.env)) {
			for (const item of params.env) {
				if (
					item &&
					typeof item === "object" &&
					typeof item.name === "string" &&
					typeof item.value === "string"
				) {
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

function firstExisting(candidates: string[]): string {
	for (const candidate of candidates) {
		if (candidate && existsSync(candidate)) return candidate;
	}
	return candidates[0] || "";
}

function findBun(home: string, npmGlobal: string): string {
	const fromPath = (process.env.PATH || "").split(/[;:]/).map((dir) => dir.replace(/^"|"$/g, ""));
	const candidates: string[] = [];
	for (const dir of fromPath) {
		if (/node\/versions/i.test(dir))
			candidates.push(join(dir, "node_modules", "bun", "bin", "bun.exe"));
		candidates.push(join(dir, "bun.exe"));
	}
	// 部分工具链会把 bun 装在版本化 node 目录里，逐个扫描。
	const versionRoots = [
		join(home, ".workbuddy", "binaries", "node", "versions"),
		join(home, "AppData", "Roaming", "nvm", "v"),
	];
	for (const root of versionRoots) {
		try {
			for (const entry of readdirSync(root)) {
				candidates.push(join(root, entry, "node_modules", "bun", "bin", "bun.exe"));
			}
		} catch {
			// 目录不存在则跳过
		}
	}
	candidates.push(join(home, ".bun", "bin", "bun.exe"), join(npmGlobal, "bun", "bin", "bun.exe"));
	return firstExisting(candidates);
}

function defaultSettings(): AppSettings {
	const home = homedir();
	const npmGlobal = app.isPackaged
		? join(home, "AppData", "Roaming", "npm")
		: process.env.npm_config_prefix || join(home, "AppData", "Roaming", "npm");
	return {
		ompCliPath: firstExisting([
			join(
				home,
				".bun",
				"install",
				"global",
				"node_modules",
				"@oh-my-pi",
				"pi-coding-agent",
				"dist",
				"cli.js",
			),
			join(npmGlobal, "node_modules", "@oh-my-pi", "pi-coding-agent", "dist", "cli.js"),
		]),
		bunPath: findBun(home, npmGlobal),
		cwd: join(home, "Desktop"),
		theme: "system",
		// omp 自身默认就是 yolo（全部自动批准），保持与 CLI 一致
		approvalMode: "yolo",
		fontScale: 1,
		linkOpenMode: "ask",
		keepAwakeOnLock: false,
		preventSystemSleep: true,
		openAtLogin: false,
		proxyMode: "direct",
		proxyUrl: "",
		autoInstallTrustedSkills: false,
		autoUpdateSkills: true,
	};
}

function loadSettings(): AppSettings {
	const defaults = defaultSettings();
	try {
		if (existsSync(SETTINGS_PATH)) {
			const saved = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as Partial<AppSettings>;
			// 旧配置里的路径若已失效，回退到自动探测值，避免开箱连不上。
			if (saved.bunPath && !existsSync(saved.bunPath)) saved.bunPath = defaults.bunPath;
			if (saved.ompCliPath && !existsSync(saved.ompCliPath)) saved.ompCliPath = defaults.ompCliPath;
			// 旧版本配置文件里没有 approvalMode，或写了非法值时回退默认档位
			if (!saved.approvalMode || !APPROVAL_MODES.includes(saved.approvalMode)) {
				saved.approvalMode = defaults.approvalMode;
			}
			if (typeof saved.fontScale !== "number" || saved.fontScale < 0.8 || saved.fontScale > 1.4) {
				saved.fontScale = defaults.fontScale;
			}
			if (!["ask", "browser", "copy"].includes(saved.linkOpenMode ?? "")) {
				saved.linkOpenMode = defaults.linkOpenMode;
			}
			if (!["direct", "system", "manual"].includes(saved.proxyMode ?? "")) {
				saved.proxyMode = defaults.proxyMode;
			}
			for (const key of [
				"keepAwakeOnLock",
				"preventSystemSleep",
				"openAtLogin",
				"autoInstallTrustedSkills",
				"autoUpdateSkills",
			] as const) {
				if (typeof saved[key] !== "boolean") saved[key] = defaults[key];
			}
			if (typeof saved.proxyUrl !== "string") saved.proxyUrl = defaults.proxyUrl;
			return { ...defaults, ...saved };
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

async function applyRuntimeSettings() {
	applyLoginItem(settings.openAtLogin);
	syncPowerBlockers(settings, agent !== null);
	await applyProxy(settings);
}

/**
 * 更新 skills.json 中登记过的注册表技能（skills.omp.sh）。
 * 只调用 `omp skill update -g`：本地手写/agents 目录里的技能没有注册表版本，
 * 逐个传名字会全部报 "Invalid skill name / not listed"。
 */
async function updateAllInstalledSkills() {
	const summary = { updated: 0, failed: 0, errors: [] as string[] };
	const result = await skillCommand(() =>
		runOmpCommand(settings, ["skill", "update", "-g", "--yes"]),
	);
	if (!result.ok) {
		summary.failed = 1;
		summary.errors.push(result.error ?? "更新技能失败");
		return summary;
	}
	// 每更新一个技能输出一行：+ @scope/name@1.2.3 或 @scope/name 1.0 → 1.2.3
	summary.updated = result.stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.startsWith("+ ") || line.includes("→")).length;
	return summary;
}

interface StoredSession {
	id: string;
	title: string;
	cwd: string;
	ts?: number;
}

function loadSessions(): StoredSession[] {
	try {
		if (!existsSync(SESSIONS_PATH)) return [];
		const parsed: unknown = JSON.parse(readFileSync(SESSIONS_PATH, "utf8"));
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(
				(item): item is StoredSession =>
					Boolean(item) &&
					typeof item === "object" &&
					typeof item.id === "string" &&
					typeof item.title === "string" &&
					typeof item.cwd === "string",
			)
			.map((item) => ({ id: item.id, title: item.title, cwd: item.cwd, ts: item.ts }));
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
		agent = spawn(
			settings.bunPath,
			[settings.ompCliPath, "acp", `--approval-mode=${settings.approvalMode}`],
			{
				cwd: settings.cwd,
				stdio: ["pipe", "pipe", "pipe"],
				windowsHide: true,
			},
		);
	} catch (e) {
		return { ok: false, error: `启动 omp 失败：${(e as Error).message}` };
	}
	syncPowerBlockers(settings, true);

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
		syncPowerBlockers(settings, false);
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
	syncPowerBlockers(settings, false);
}

// ---------------------------------------------------------------------------
// Electron 生命周期
// ---------------------------------------------------------------------------

function createWindow() {
	const win = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 900,
		minHeight: 600,
		title: "OMP Desktop",
		frame: false,
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
	ipcMain.handle("window:minimize", () => BrowserWindow.getFocusedWindow()?.minimize());
	ipcMain.handle("window:maximize", () => {
		const win = BrowserWindow.getFocusedWindow();
		if (!win) return;
		if (win.isMaximized()) win.unmaximize();
		else win.maximize();
	});
	ipcMain.handle("window:close", () => BrowserWindow.getFocusedWindow()?.close());

	ipcMain.handle("settings:get", () => settings);
	ipcMain.handle("settings:set", async (_e, next: Partial<AppSettings>) => {
		const requestedTheme = next.theme;
		const theme =
			requestedTheme === "light" || requestedTheme === "dark" || requestedTheme === "system"
				? requestedTheme
				: settings.theme;
		const fontScale =
			typeof next.fontScale === "number" && next.fontScale >= 0.8 && next.fontScale <= 1.4
				? next.fontScale
				: settings.fontScale;
		settings = { ...settings, ...next, theme, fontScale };
		nativeTheme.themeSource = theme === "system" ? "system" : theme;
		saveSettings(settings);
		await applyRuntimeSettings();
		return settings;
	});
	ipcMain.handle("system:info", () => getSystemInfo());
	ipcMain.handle("system:open-path", (_e, path: string) => openPath(path));
	ipcMain.handle("system:pick-directory", () => pickDirectory());
	ipcMain.handle("links:open", (_e, url: string) => openLink(url, settings.linkOpenMode));
	ipcMain.handle("sessions:get", () => loadSessions());
	ipcMain.handle("sessions:set", (_e, next: StoredSession[]) => {
		saveSessions(next);
		return next;
	});
	ipcMain.handle("models:context", () => readModelContexts());

	ipcMain.handle("file:open", async () => {
		const result = await dialog.showOpenDialog({
			title: "选择要预览的文件",
			properties: ["openFile"],
			filters: [
				{
					name: "文本与代码文件",
					extensions: [
						"js",
						"jsx",
						"mjs",
						"cjs",
						"ts",
						"tsx",
						"json",
						"jsonc",
						"md",
						"mdx",
						"css",
						"scss",
						"less",
						"html",
						"htm",
						"vue",
						"py",
						"rb",
						"go",
						"rs",
						"java",
						"kt",
						"c",
						"h",
						"cpp",
						"hpp",
						"cs",
						"php",
						"sh",
						"bash",
						"ps1",
						"yml",
						"yaml",
						"toml",
						"ini",
						"sql",
						"txt",
						"env",
					],
				},
				{ name: "所有文件", extensions: ["*"] },
			],
		});
		if (result.canceled || result.filePaths.length === 0) return null;
		return readTextDocument(result.filePaths[0]);
	});

	ipcMain.handle("file:read", (_e, filePath: string) => readTextDocument(filePath));
	ipcMain.handle("mcp:list", () => listMcpServers(settings.cwd));

	// 技能管理：命令全部委托给 omp CLI，返回结构化结果避免跨进程异常丢失信息。
	ipcMain.handle("skills:list", (_e, cwd?: string) =>
		skillCall(() => listSkills(settings, cwd || settings.cwd)),
	);
	ipcMain.handle("skills:search", (_e, query: string, sort: "relevance" | "downloads" | "recent") =>
		skillCall(() => searchSkills(settings, query, sort)),
	);
	ipcMain.handle("skills:info", (_e, spec: string) =>
		skillCall(() => showSkillInfo(settings, spec)),
	);
	ipcMain.handle("skills:install", (_e, spec: string, scope: "user" | "project") =>
		skillCommand(() => installSkill(settings, spec, scope)),
	);
	ipcMain.handle("skills:uninstall", (_e, name: string, scope: "user" | "project") =>
		skillCommand(() => uninstallSkill(settings, name, scope)),
	);
	ipcMain.handle("skills:publish", (_e, dir: string, scope: string) =>
		skillCommand(() => publishSkill(settings, dir, scope)),
	);
	ipcMain.handle("skills:enabled", (_e, name: string, enabled: boolean) =>
		skillCall(() => setSkillEnabled(settings, name, enabled)),
	);
	ipcMain.handle("skills:config", (_e, key: string) =>
		skillCall(() => getSkillConfigValue(settings, key)),
	);
	ipcMain.handle("skills:paths", () => skillCall(() => getSkillPaths(settings)));
	ipcMain.handle("skills:update-all", () => updateAllInstalledSkills());
	ipcMain.handle(
		"skills:create",
		(_e, input: { name: string; description: string; scope: "user" | "project" }) =>
			skillCall(() => createSkill(settings, input)),
	);

	const acpToolHandlers: Record<
		string,
		(params: Record<string, unknown>) => ToolResult | Promise<ToolResult>
	> = {
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

	void applyRuntimeSettings();
	if (settings.autoUpdateSkills) {
		// 启动后稍等再做，避免和窗口/会话初始化争抢 IO
		setTimeout(() => {
			void updateAllInstalledSkills().catch((error) =>
				console.error("auto skill update failed", error),
			);
		}, 1500);
	}

	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	stopAgent();
	if (process.platform !== "darwin") app.quit();
});
