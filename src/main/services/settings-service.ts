/**
 * 应用设置的状态与持久化：默认值、旧配置兼容、字段校验。
 * 只负责「本地这份设置」，把设置同步到 omp 配置由 omp-config-service 处理。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { app } from "electron";
import {
	POLICY_TOOLS,
	type DesktopSettings,
	type ReplyStyle,
	type ToolPolicy,
} from "../../shared/types";
import { applyLoginItem, applyProxy, syncPowerBlockers } from "../platform/system";
import { applyNativeTheme } from "../platform/theme";
import type { SkillHostSettings } from "./skill-service";

const APPROVAL_MODES: DesktopSettings["approvalMode"][] = [
	"always-ask",
	"always-ask-cached",
	"write",
	"yolo",
];

export const SETTINGS_PATH = join(app.getPath("userData"), "settings.json");

function firstExisting(candidates: string[]): string {
	for (const candidate of candidates) {
		if (candidate && existsSync(candidate)) return candidate;
	}
	return candidates[0] || "";
}

function findBun(home: string, npmGlobal: string): string {
	// 必须用 path.delimiter：Windows 用 ; 分隔，盘符里的冒号不能当分隔符。
	const fromPath = (process.env.PATH || "")
		.split(delimiter)
		.map((dir) => dir.replace(/^"|"$/g, ""));
	// 可执行文件名按平台派生，非 Windows 没有 .exe 后缀。
	const bunExe = process.platform === "win32" ? "bun.exe" : "bun";
	const candidates: string[] = [];
	for (const dir of fromPath) {
		if (/node[\\/]versions/i.test(dir))
			candidates.push(join(dir, "node_modules", "bun", "bin", bunExe));
		candidates.push(join(dir, bunExe));
	}
	// 部分工具链会把 bun 装在版本化 node 目录里，逐个扫描。
	const versionRoots = [
		join(home, ".workbuddy", "binaries", "node", "versions"),
		join(home, "AppData", "Roaming", "nvm", "v"),
	];
	for (const root of versionRoots) {
		try {
			for (const entry of readdirSync(root)) {
				candidates.push(join(root, entry, "node_modules", "bun", "bin", bunExe));
			}
		} catch {
			// 目录不存在则跳过
		}
	}
	candidates.push(join(home, ".bun", "bin", bunExe), join(npmGlobal, "bun", "bin", bunExe));
	return firstExisting(candidates);
}

export function defaultSettings(): DesktopSettings {
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
		userNickname: "",
		assistantName: "",
		replyStyle: "default",
		customInstructions: "",
		homeSuggestions: true,
		memoryMode: "off",
		autoLearnSkills: false,
		workBackground: "",
		sensitiveGuard: true,
		restrictedFolders: [],
		toolPolicies: {},
		auditEnabled: true,
	};
}

function loadSettings(): DesktopSettings {
	const defaults = defaultSettings();
	try {
		if (existsSync(SETTINGS_PATH)) {
			const saved = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as Partial<DesktopSettings>;
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
				"homeSuggestions",
				"autoLearnSkills",
				"sensitiveGuard",
				"auditEnabled",
			] as const) {
				if (typeof saved[key] !== "boolean") saved[key] = defaults[key];
			}
			if (typeof saved.proxyUrl !== "string") saved.proxyUrl = defaults.proxyUrl;
			for (const key of [
				"userNickname",
				"assistantName",
				"customInstructions",
				"workBackground",
			] as const) {
				if (typeof saved[key] !== "string") saved[key] = defaults[key];
			}
			if (!["default", "friendly", "pragmatic", "none"].includes(saved.replyStyle ?? "")) {
				saved.replyStyle = defaults.replyStyle;
			}
			if (!["off", "local"].includes(saved.memoryMode ?? "")) {
				saved.memoryMode = defaults.memoryMode;
			}
			saved.restrictedFolders = Array.isArray(saved.restrictedFolders)
				? saved.restrictedFolders.filter((item): item is string => typeof item === "string")
				: defaults.restrictedFolders;
			const policies: Partial<Record<string, ToolPolicy>> = {};
			if (saved.toolPolicies && typeof saved.toolPolicies === "object") {
				for (const tool of POLICY_TOOLS) {
					const value = (saved.toolPolicies as Record<string, unknown>)[tool];
					if (value === "allow" || value === "prompt" || value === "deny") policies[tool] = value;
				}
			}
			saved.toolPolicies = policies;
			return { ...defaults, ...saved };
		}
	} catch {
		// 配置损坏时回退默认值
	}
	return defaults;
}

let settings = loadSettings();
applyNativeTheme(settings.theme);

export function getSettings(): DesktopSettings {
	return settings;
}

export function persistSettings(next: DesktopSettings) {
	mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
	writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2), "utf8");
}

/**
 * 合并渲染层提交的部分设置并落盘。
 * 主题与字号是界面唯一会即时变化的字段，这里做取值兜底，避免脏值写进配置。
 */
export function updateSettings(patch: Partial<DesktopSettings>): DesktopSettings {
	const requestedTheme = patch.theme;
	const theme =
		requestedTheme === "light" || requestedTheme === "dark" || requestedTheme === "system"
			? requestedTheme
			: settings.theme;
	const fontScale =
		typeof patch.fontScale === "number" && patch.fontScale >= 0.8 && patch.fontScale <= 1.4
			? patch.fontScale
			: settings.fontScale;
	settings = { ...settings, ...patch, theme, fontScale };
	applyNativeTheme(theme);
	persistSettings(settings);
	return settings;
}

/** 把与进程/系统相关的设置应用到当前进程；agentRunning 决定是否阻止系统休眠 */
export async function applyRuntimeSettings(agentRunning: boolean) {
	applyLoginItem(settings.openAtLogin);
	syncPowerBlockers(settings, agentRunning);
	await applyProxy(settings);
}

/** 传 omp CLI 调用所需的宿主信息（路径 + 代理）。 */
export function hostSettings(): SkillHostSettings {
	return {
		bunPath: settings.bunPath,
		ompCliPath: settings.ompCliPath,
		cwd: settings.cwd,
		proxyMode: settings.proxyMode,
		proxyUrl: settings.proxyUrl,
	};
}

export type { ReplyStyle };
