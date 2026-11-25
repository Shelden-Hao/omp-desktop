import { mkdirSync, statfsSync } from "node:fs";
import { join } from "node:path";
import { app, clipboard, dialog, powerSaveBlocker, session, shell } from "electron";
import type { LinkOpenMode, ProxyMode, SystemInfoData } from "../renderer/acp-client";

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
	const result = await dialog.showOpenDialog({
		title: "选择 omp 默认工作空间",
		properties: ["openDirectory", "createDirectory"],
	});
	if (result.canceled) return null;
	return result.filePaths[0] ?? null;
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
