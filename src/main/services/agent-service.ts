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

export async function startAgent(): Promise<{ ok: boolean; error?: string }> {
	// 等旧进程真正退出再拉新的，否则两个 omp 会同时持有同一份会话存储
	await stopAgent();
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

	let child: ChildProcess;
	try {
		const args = [settings.ompCliPath, "acp", `--approval-mode=${settings.approvalMode}`];
		const appended = composeSystemPrompt();
		if (appended) args.push(`--append-system-prompt=${appended}`);
		child = spawn(settings.bunPath, args, {
			cwd: settings.cwd,
			env: proxyEnv(settings.proxyMode, settings.proxyUrl),
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
	} catch (e) {
		return { ok: false, error: `启动 omp 失败：${(e as Error).message}` };
	}
	agent = child;
	syncPowerBlockers(settings, true);

	// 切分缓冲区跟着进程走：重启时旧进程若还有残余帧，不能污染新进程的半个 frame
	let stdoutBuffer = "";
	child.stdout?.setEncoding("utf8");
	child.stdout?.on("data", (chunk: string) => {
		if (agent !== child) return;
		stdoutBuffer += chunk;
		let idx: number;
		while ((idx = stdoutBuffer.indexOf("\n")) >= 0) {
			const line = stdoutBuffer.slice(0, idx).trim();
			stdoutBuffer = stdoutBuffer.slice(idx + 1);
			if (line) output?.frame(line);
		}
	});

	child.stderr?.setEncoding("utf8");
	child.stderr?.on("data", (chunk: string) => {
		if (agent !== child) return;
		output?.stderr(chunk);
	});

	child.on("exit", (code) => {
		// 只有「仍是当前进程」才算真的退出。切换安全等级会 kill 旧进程再 spawn 新进程，
		// 旧进程的 exit 迟到一步就会把新进程的引用清成 null，之后所有请求都报「omp 未运行」。
		if (agent !== child) return;
		agent = null;
		output?.exit(String(code ?? 0));
		syncPowerBlockers(getSettings(), false);
	});

	child.on("error", (e) => {
		output?.stderr(`[spawn error] ${e.message}`);
	});

	return { ok: true };
}

let pendingStop: Promise<void> | null = null;

/**
 * 优雅停止：先关 stdin 让 omp 走完自己的退出流程（会话要落盘、上下文才不会丢），
 * 超过宽限期还不退再 kill。切换安全等级就要走这条路，直接 SIGKILL 会让 omp 来不及写盘。
 */
export function stopAgent(waitMs = 2500): Promise<void> {
	if (pendingStop) return pendingStop;
	const stopping = agent;
	// 先摘引用：exit 回调看到 agent !== child 就不会再广播一次退出
	agent = null;
	releaseAllTerminals();
	if (!stopping) {
		syncPowerBlockers(getSettings(), false);
		return Promise.resolve();
	}
	stopping.stdin?.end();
	pendingStop = new Promise<void>((resolve) => {
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			pendingStop = null;
			syncPowerBlockers(getSettings(), false);
			resolve();
		};
		const timer = setTimeout(() => stopping.kill(), waitMs);
		stopping.once("exit", () => {
			clearTimeout(timer);
			finish();
		});
		// 进程可能在我们挂监听之前就已经退了，此时 exit 不会再触发
		if (stopping.exitCode !== null || stopping.signalCode !== null) {
			clearTimeout(timer);
			finish();
		}
	});
	return pendingStop;
}

/** ACP 请求经 stdin 写入，NDJSON 一行一帧 */
export function sendFrame(line: string): { ok: boolean; error?: string } {
	if (!agent?.stdin?.writable) return { ok: false, error: "omp 未运行" };
	agent.stdin.write(line + "\n");
	return { ok: true };
}
