/**
 * omp 配置桥：读 `~/.omp/agent/config.yml`，写统一走 `omp config set`。
 * 直读是为了避免每个设置项都 spawn 一次 CLI；写走 CLI 是为了让 omp 自己做
 * 类型校验和分层写入（global 层），外壳不臆造配置格式。
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import type { ApprovalMode } from "../renderer/acp-client";
import type { SkillCommandResult } from "./skills";
import { runOmpCommand, type SkillHostSettings } from "./skills";

export type ToolPolicy = "allow" | "prompt" | "deny";
export type MemoryBackend = "off" | "local" | "mnemopi" | "hindsight" | "sharpshooter";
export type ReplyStyle = "default" | "friendly" | "pragmatic" | "none";

/**
 * 安全中心实际可控的几类动作。omp 的 `tools.approval` 支持任意工具名，
 * 这里只暴露官方内置的读写壳工具，避免用户写出永不命中的策略。
 */
export const POLICY_TOOLS = ["bash", "write", "edit", "read"] as const;

export interface OmpConfigSnapshot {
	memoryBackend: MemoryBackend;
	memoriesEnabled: boolean;
	autoLearn: boolean;
	personality: ReplyStyle;
	approvalMode: ApprovalMode;
	approval: Record<string, ToolPolicy>;
	restrictedFolders: string[];
	modelRoles: Record<string, string>;
	/** omp 在 Windows 上执行命令用的 shell */
	shellPath: string;
}

const CONFIG_PATH = join(homedir(), ".omp", "agent", "config.yml");

function readRaw(): Record<string, unknown> {
	if (!existsSync(CONFIG_PATH)) return {};
	try {
		const parsed: unknown = parse(readFileSync(CONFIG_PATH, "utf8"));
		return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

function pick<T>(source: Record<string, unknown>, path: string[], fallback: T): T {
	let cursor: unknown = source;
	for (const key of path) {
		if (!cursor || typeof cursor !== "object") return fallback;
		cursor = (cursor as Record<string, unknown>)[key];
	}
	return (cursor as T) ?? fallback;
}

/** 读取当前生效的 omp 配置（只读 global 层，和 ACP 子进程一致）。 */
export function readOmpConfig(): OmpConfigSnapshot {
	const raw = readRaw();
	const approvalRaw = pick<Record<string, unknown>>(raw, ["tools", "approval"], {});
	const approval: Record<string, ToolPolicy> = {};
	for (const tool of POLICY_TOOLS) {
		const value = approvalRaw[tool];
		if (value === "allow" || value === "prompt" || value === "deny") approval[tool] = value;
	}
	const folders = pick<unknown>(raw, ["tools", "restrictedFolders"], []);
	const memory = pick<string>(raw, ["memory", "backend"], "off");
	const personality = pick<string>(raw, ["personality"], "default");
	return {
		memoryBackend: (["off", "local", "mnemopi", "hindsight", "sharpshooter"] as const).includes(
			memory as MemoryBackend,
		)
			? (memory as MemoryBackend)
			: "off",
		memoriesEnabled: pick<boolean>(raw, ["memories", "enabled"], false),
		autoLearn: pick<boolean>(raw, ["autolearn", "enabled"], false),
		personality: (["default", "friendly", "pragmatic", "none"] as const).includes(
			personality as ReplyStyle,
		)
			? (personality as ReplyStyle)
			: "default",
		approvalMode: (["always-ask", "always-ask-cached", "write", "yolo"] as const).includes(
			pick<string>(raw, ["tools", "approvalMode"], "yolo") as ApprovalMode,
		)
			? pick<ApprovalMode>(raw, ["tools", "approvalMode"], "yolo")
			: "yolo",
		approval,
		restrictedFolders: Array.isArray(folders)
			? folders.filter((item): item is string => typeof item === "string")
			: [],
		modelRoles: pick<Record<string, string>>(raw, ["modelRoles"], {}),
		shellPath: pick<string>(raw, ["shellPath"], ""),
	};
}

export function ompConfigPath() {
	return CONFIG_PATH;
}

/**
 * 批量写入。逐条执行 `omp config set`：omp 会自己做类型校验，
 * 单条失败不影响其它条，最后统一返回失败原因。
 */
export async function writeOmpConfig(
	host: SkillHostSettings,
	entries: Array<[string, string]>,
): Promise<SkillCommandResult> {
	const failures: string[] = [];
	for (const [key, value] of entries) {
		const result = await runOmpCommand(host, ["config", "set", key, value]);
		if (!result.ok) failures.push(`${key}：${result.error ?? result.stderr.trim() ?? "写入失败"}`);
	}
	return {
		ok: failures.length === 0,
		stdout: "",
		stderr: failures.join("\n"),
		error: failures.length ? failures.join("；") : undefined,
	};
}
