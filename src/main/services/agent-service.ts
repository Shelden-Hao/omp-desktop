/**
 * omp ACP 子进程的生命周期：spawn `bun <omp-cli> acp`，按行切 NDJSON 帧，
 * 以及把个性化设置合成追加系统提示。
 * 这里不直接碰 BrowserWindow：帧/日志/退出通过注入的 sink 交给 IPC 层广播。
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { proxyEnv, syncPowerBlockers } from "../platform/system";
import { getSettings } from "./settings-service";
import { releaseAllTerminals } from "./terminal-service";

export interface AgentOutput {
	frame(line: string): void;
	stderr(text: string): void;
	exit(code: string): void;
}

let agent: ChildProcess | null = null;
let stdoutBuffer = "";
let output: AgentOutput | null = null;

/** 由 IPC 层注入广播实现；窗口尚未就绪时事件直接丢弃 */
export function setAgentOutput(sink: AgentOutput) {
	output = sink;
}

export function isAgentRunning() {
	return agent !== null;
}

/**
 * 把个性化与安全设置合成一段追加系统提示，通过 --append-system-prompt 传给 omp。
 * omp 没有独立的「称呼/指令」配置项，这是唯一真实生效的注入点。
 */
export function composeSystemPrompt(): string {
	const settings = getSettings();
	const parts: string[] = [];
	const name = settings.assistantName.trim();
	const nickname = settings.userNickname.trim();
	if (name) parts.push(`你的名字是「${name}」，被问到时用这个名字自称。`);
	if (nickname) parts.push(`称呼用户为「${nickname}」。`);
	const background = settings.workBackground.trim();
	if (background) parts.push(`【用户工作背景】\n${background}`);
	const instructions = settings.customInstructions.trim();
	if (instructions) parts.push(`【用户长期指令】\n${instructions}`);
	return parts.join("\n\n");
}

export function startAgent(): { ok: boolean; error?: string } {
	stopAgent();
	stdoutBuffer = "";
	const settings = getSettings();

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
		const args = [settings.ompCliPath, "acp", `--approval-mode=${settings.approvalMode}`];
		const appended = composeSystemPrompt();
		if (appended) args.push(`--append-system-prompt=${appended}`);
		agent = spawn(settings.bunPath, args, {
			cwd: settings.cwd,
			env: proxyEnv(settings.proxyMode, settings.proxyUrl),
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
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
			if (line) output?.frame(line);
		}
	});

	agent.stderr?.setEncoding("utf8");
	agent.stderr?.on("data", (chunk: string) => output?.stderr(chunk));

	agent.on("exit", (code) => {
		output?.exit(String(code ?? 0));
		agent = null;
		syncPowerBlockers(getSettings(), false);
	});

	agent.on("error", (e) => {
		output?.stderr(`[spawn error] ${e.message}`);
	});

	return { ok: true };
}

export function stopAgent() {
	releaseAllTerminals();
	if (agent) {
		agent.stdin?.end();
		agent.kill();
		agent = null;
	}
	syncPowerBlockers(getSettings(), false);
}

/** ACP 请求经 stdin 写入，NDJSON 一行一帧 */
export function sendFrame(line: string): { ok: boolean; error?: string } {
	if (!agent?.stdin?.writable) return { ok: false, error: "omp 未运行" };
	agent.stdin.write(line + "\n");
	return { ok: true };
}
