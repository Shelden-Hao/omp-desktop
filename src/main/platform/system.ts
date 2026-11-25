import { existsSync, mkdirSync, statfsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { app, BrowserWindow, clipboard, dialog, powerSaveBlocker, session, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import type { LinkOpenMode, ProxyMode, RuntimeInfo, SystemInfoData } from "../../shared/types";

export interface RuntimeSettings {
	linkOpenMode: LinkOpenMode;
	keepAwakeOnLock: boolean;
	preventSystemSleep: boolean;
	openAtLogin: boolean;
	proxyMode: ProxyMode;
	proxyUrl: string;
}

let sleepBlocker: number | null = null;

export function getSystemInfo(): SystemInfoData {
	// Electron 45 的 getPath 不再接受 "cache"，用 userData 下的 Cache 目录作为真实缓存位置
	const cacheDir = join(app.getPath("userData"), "Cache");
	mkdirSync(cacheDir, { recursive: true });
	let usedBytes = 0;
	let totalBytes = 0;
	let availableBytes = 0;
	try {
		const stat = statfsSync(cacheDir);
		totalBytes = stat.blocks * stat.bsize;
		usedBytes = (stat.blocks - stat.bfree) * stat.bsize;
		availableBytes = stat.bavail * stat.bsize;
	} catch {
		// 某些平台不支持 statfs，界面显示 0 而不是报错
	}
	return {
		cacheDir,
		usedBytes,
		totalBytes,
		availableBytes,
		openAtLogin: app.getLoginItemSettings().openAtLogin,
	};
}

export async function openPath(path: string): Promise<{ ok: boolean; error?: string }> {
	// shell.openPath 返回空串表示成功
	const error = await shell.openPath(path);
	return error === "" ? { ok: true } : { ok: false, error };
}

export async function pickDirectory(): Promise<string | null> {
	// 挂到当前窗口上：目录选择属于一次明确的用户操作，不应该让主窗口还能点
	const parent = BrowserWindow.getFocusedWindow();
	const options: OpenDialogOptions = {
		title: "选择工作目录",
		properties: ["openDirectory", "createDirectory"],
	};
	const result = parent
		? await dialog.showOpenDialog(parent, options)
		: await dialog.showOpenDialog(options);
	if (result.canceled) return null;
	return result.filePaths[0] ?? null;
}

/** 选择要预览的文本/代码文件；只返回路径，读取与校验交给 workspace-service */
export async function pickTextFile(): Promise<string | null> {
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
	return result.filePaths[0];
}

export function applyLoginItem(enabled: boolean) {
	try {
		app.setLoginItemSettings({
			openAtLogin: enabled,
			// 开发态必须带上应用目录，否则登录项只会启动一个空的 Electron
			args: app.isPackaged ? [] : [app.getAppPath()],
		});
	} catch (error) {
		console.error("setLoginItemSettings failed", error);
	}
}

export function syncPowerBlockers(settings: RuntimeSettings, agentRunning: boolean) {
	// 锁屏运行只阻止系统挂起，允许屏幕正常熄灭；运行时防止休眠同理。
	// 两个开关共用一个 blocker，避免重复持有系统电源锁。
	const shouldBlockSleep =
		settings.keepAwakeOnLock || (settings.preventSystemSleep && agentRunning);
	if (shouldBlockSleep && sleepBlocker === null) {
		sleepBlocker = powerSaveBlocker.start("prevent-app-suspension");
	} else if (!shouldBlockSleep && sleepBlocker !== null) {
		powerSaveBlocker.stop(sleepBlocker);
		sleepBlocker = null;
	}
}

/**
 * omp CLI / ACP 子进程不读 Electron 的 session proxy，只能通过环境变量传。
 * direct 模式显式清掉宿主环境里的代理，避免“设置成直连却仍走系统代理”。
 */
export function proxyEnv(mode: ProxyMode, rawUrl: string): NodeJS.ProcessEnv {
	const env = { ...process.env };
	delete env.ELECTRON_RUN_AS_NODE;
	const proxy = rawUrl.trim();
	if (mode === "manual" && proxy) {
		env.HTTP_PROXY = proxy;
		env.HTTPS_PROXY = proxy;
		env.ALL_PROXY = proxy;
		if (!env.NO_PROXY) env.NO_PROXY = "localhost,127.0.0.1,::1";
	} else if (mode === "direct") {
		for (const key of [
			"HTTP_PROXY",
			"HTTPS_PROXY",
			"ALL_PROXY",
			"http_proxy",
			"https_proxy",
			"all_proxy",
		]) {
			delete env[key];
		}
	}
	return env;
}

export async function applyProxy(settings: RuntimeSettings): Promise<void> {
	try {
		if (settings.proxyMode === "system") {
			await session.defaultSession.setProxy({ mode: "system" });
		} else if (settings.proxyMode === "manual" && settings.proxyUrl.trim()) {
			await session.defaultSession.setProxy({
				mode: "fixed_servers",
				proxyRules: settings.proxyUrl.trim(),
			});
		} else {
			await session.defaultSession.setProxy({ mode: "direct" });
		}
	} catch (error) {
		console.error("setProxy failed", error);
	}
}

/** 链接打开策略在主进程执行，渲染层只传 URL，避免 shell 能力暴露给页面。 */
export async function openLink(rawUrl: string, mode: LinkOpenMode): Promise<void> {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new Error("链接地址无效");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("仅支持 http/https 链接");
	}
	const target = url.href;
	if (mode === "copy") {
		await clipboard.writeText(target);
		return;
	}
	if (mode === "ask") {
		const choice = await dialog.showMessageBox({
			type: "question",
			buttons: ["用浏览器打开", "复制地址", "取消"],
			defaultId: 0,
			cancelId: 2,
			message: "打开链接",
			detail: target,
		});
		if (choice.response === 2) return;
		if (choice.response === 1) {
			await clipboard.writeText(target);
			return;
		}
	}
	await shell.openExternal(target);
}

/**
 * 内置运行时探测：omp 实际调用的是系统里的 node / python / Git Bash。
 * 这里只做只读探测给安全中心展示，不做「假装自带运行时」的开关。
 */
function probeVersion(command: string, args: string[], shellPath?: string): Promise<string | null> {
	return new Promise((done) => {
		let text = "";
		let settled = false;
		const finish = (value: string | null) => {
			if (settled) return;
			settled = true;
			done(value);
		};
		const child = spawn(command, args, {
			shell: true,
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, ...(shellPath ? { SHELL: shellPath } : {}) },
		});
		const timer = setTimeout(() => {
			child.kill();
			finish(null);
		}, 4000);
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			text += chunk;
		});
		child.stderr?.on("data", (chunk: string) => {
			text += chunk;
		});
		child.on("error", () => {
			clearTimeout(timer);
			finish(null);
		});
		child.on("close", () => {
			clearTimeout(timer);
			const line = text.split(/\r?\n/).find((item) => item.trim().length > 0);
			finish(line ? line.trim() : null);
		});
	});
}

export async function detectRuntimes(shellPath?: string): Promise<RuntimeInfo[]> {
	const [node, python, bun] = await Promise.all([
		probeVersion("node", ["--version"]),
		probeVersion("python", ["--version"]),
		probeVersion("bun", ["--version"]),
	]);
	const bash = shellPath && existsSync(shellPath) ? shellPath : "";
	return [
		{
			id: "node",
			name: "Node.js",
			version: node ?? "",
			path: "",
			available: Boolean(node),
			note: "omp 的 MCP / 扩展脚本依赖 Node.js",
		},
		{
			id: "python",
			name: "Python",
			version: python ?? "",
			path: "",
			available: Boolean(python),
			note: "脚本、自动化与数据处理类任务使用",
		},
		{
			id: "bash",
			name: "Git Bash",
			version: bash ? "已配置" : "",
			path: bash,
			available: Boolean(bash),
			note: "omp 在 Windows 上执行 shell 命令的默认环境",
		},
		{
			id: "bun",
			name: "Bun",
			version: bun ?? "",
			path: "",
			available: Boolean(bun),
			note: "omp CLI 本身的运行宿主",
		},
	];
}
