/**
 * ACP terminal 回调：由外壳真正起子进程，输出按字节上限截断，
 * 退出码与信号在 wait/kill/release 之间共享。
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { ToolResult } from "../../shared/types";
import { getSettings } from "./settings-service";
import { resolveWorkspacePath } from "./workspace-service";

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

function toolOk(result: unknown = {}): ToolResult {
	return { ok: true, result };
}

function toolFail(error: unknown): ToolResult {
	return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

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

/** 停止 agent 时一并回收所有终端，避免遗留子进程 */
export function releaseAllTerminals() {
	for (const session of terminals.values()) terminateTerminal(session);
	terminals.clear();
}

export function acpTerminalCreate(params: Record<string, unknown>): ToolResult {
	try {
		if (typeof params.command !== "string" || !params.command) throw new Error("缺少命令");
		const args = Array.isArray(params.args)
			? params.args.filter((item): item is string => typeof item === "string")
			: [];
		const workspace = resolve(getSettings().cwd);
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

export function acpTerminalOutput(params: Record<string, unknown>): ToolResult {
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

export async function acpTerminalWait(params: Record<string, unknown>): Promise<ToolResult> {
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

export function acpTerminalKill(params: Record<string, unknown>): ToolResult {
	try {
		terminateTerminal(requireTerminal(params));
		return toolOk();
	} catch (error) {
		return toolFail(error);
	}
}

export function acpTerminalRelease(params: Record<string, unknown>): ToolResult {
	try {
		const session = requireTerminal(params);
		terminateTerminal(session);
		terminals.delete(session.id);
		return toolOk();
	} catch (error) {
		return toolFail(error);
	}
}
