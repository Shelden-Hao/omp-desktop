/**
 * omp ACP 子进程通道，以及 agent 反向请求的 fs/terminal 回调。
 * 回调统一返回 { ok, result | error }，避免跨进程异常只剩字符串。
 */

import { ipcMain } from "electron";
import type { ToolResult } from "../../shared/types";
import { isAgentRunning, sendFrame, startAgent, stopAgent } from "../services/agent-service";
import {
	acpTerminalCreate,
	acpTerminalKill,
	acpTerminalOutput,
	acpTerminalRelease,
	acpTerminalWait,
} from "../services/terminal-service";
import { acpFsRead, acpFsWrite } from "../services/workspace-service";

type ToolHandler = (params: Record<string, unknown>) => ToolResult | Promise<ToolResult>;

const TOOL_CHANNELS: Record<string, ToolHandler> = {
	"acp:fs-read": acpFsRead,
	"acp:fs-write": acpFsWrite,
	"acp:terminal-create": acpTerminalCreate,
	"acp:terminal-output": acpTerminalOutput,
	"acp:terminal-wait": acpTerminalWait,
	"acp:terminal-kill": acpTerminalKill,
	"acp:terminal-release": acpTerminalRelease,
};

export function registerAgentIpc() {
	for (const [channel, handler] of Object.entries(TOOL_CHANNELS)) {
		ipcMain.handle(channel, (_e, params: Record<string, unknown>) => handler(params || {}));
	}

	ipcMain.handle("agent:start", () => startAgent());
	ipcMain.handle("agent:stop", () => {
		stopAgent();
		return { ok: true };
	});
	ipcMain.handle("agent:status", () => ({ running: isAgentRunning() }));
	ipcMain.handle("agent:send", (_e, line: string) => sendFrame(line));
}
