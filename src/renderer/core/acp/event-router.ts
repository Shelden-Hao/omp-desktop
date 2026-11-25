/**
 * ACP 事件 → 界面指令 的路由层。
 *
 * 这一层不认识 React：把 omp 推来的 `session/update` 与 server request 解析成
 * 一组描述性指令（effect），由 hooks 层负责落到 state 上。好处是协议字段解析
 * 可以单独推理，不用在组件里翻 setState。
 */

import type { AcpEvent } from "../../../shared/protocol";
import type { SessionConfigOption } from "../../../shared/types";
import { normalizeSessionState } from "./client";
import { extractText, formatToolInput } from "../tool-input";

/** 工具调用块的原始字段，交由消息层组装成 ContentBlock */
export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  title: string;
  kind: string;
  rawInput: string;
  result: string;
  raw: unknown;
}

export type SessionUpdateEffect =
  | { type: "mode"; sessionId: string; modeId: string }
  | { type: "config"; sessionId: string; configOptions: SessionConfigOption[] }
  | { type: "usage"; sessionId: string; size: number; used: number }
  | { type: "user-chunk"; sessionId: string; text: string }
  | { type: "agent-chunk"; sessionId: string; text: string }
  | { type: "thought-chunk"; sessionId: string; text: string }
  | { type: "tool-call"; sessionId: string; tool: ToolCallInfo }
  | {
      type: "tool-update";
      sessionId: string;
      toolCallId: string;
      status?: "completed" | "failed";
      title?: string;
      result?: string;
    };

/** 解析 `session/update` 通知；无法识别时返回 null，调用方直接忽略 */
export function routeSessionUpdate(
  params: Record<string, unknown>,
  fallbackSessionId: string | null,
): SessionUpdateEffect | null {
  const update = params.update as Record<string, unknown> | undefined;
  if (!update) return null;
  const sessionId = (params.sessionId as string) || fallbackSessionId;
  if (!sessionId) return null;
  const kind = update.sessionUpdate as string;

  if (kind === "current_mode_update") {
    return { type: "mode", sessionId, modeId: String(update.currentModeId || "") };
  }
  if (kind === "config_option_update") {
    const normalized = normalizeSessionState({ configOptions: update.configOptions });
    return { type: "config", sessionId, configOptions: normalized.configOptions };
  }
  if (kind === "usage_update") {
    // omp 每次请求结束推送一次，只有总量，没有分项；分项走 /context 解析
    return {
      type: "usage",
      sessionId,
      size: Number(update.size) || 0,
      used: Number(update.used) || 0,
    };
  }

  const content = update.content as { text?: string } | undefined;
  if (!content?.text) {
    if (kind === "tool_call") return routeToolCall(update, sessionId);
    if (kind === "tool_call_update") return routeToolUpdate(update, sessionId);
    return null;
  }

  if (kind === "user_message_chunk") {
    return { type: "user-chunk", sessionId, text: content.text };
  }
  if (kind === "agent_message_chunk") {
    return { type: "agent-chunk", sessionId, text: content.text };
  }
  if (kind === "agent_thought_chunk") {
    return { type: "thought-chunk", sessionId, text: content.text };
  }
  if (kind === "tool_call") return routeToolCall(update, sessionId);
  if (kind === "tool_call_update") return routeToolUpdate(update, sessionId);
  return null;
}

function routeToolCall(
  update: Record<string, unknown>,
  sessionId: string,
): SessionUpdateEffect | null {
  const toolCallId = update.toolCallId as string;
  if (!toolCallId) return null;
  const toolKind = typeof update.kind === "string" ? update.kind : "";
  return {
    type: "tool-call",
    sessionId,
    tool: {
      toolCallId,
      toolName: typeof update.name === "string" && update.name ? update.name : toolKind || "tool",
      title: typeof update.title === "string" ? update.title : "",
      kind: toolKind,
      rawInput: formatToolInput(update.rawInput),
      result: extractText(update.content),
      raw: update,
    },
  };
}

function routeToolUpdate(
  update: Record<string, unknown>,
  sessionId: string,
): SessionUpdateEffect | null {
  const toolCallId = update.toolCallId as string;
  if (!toolCallId) return null;
  const next = update.status as string;
  return {
    type: "tool-update",
    sessionId,
    toolCallId,
    status: next === "completed" ? "completed" : next === "failed" ? "failed" : undefined,
    title: typeof update.title === "string" ? update.title : undefined,
    result: update.content !== undefined ? extractText(update.content) : undefined,
  };
}

/** 工具类 RPC 的本地执行方法名，用于把 switch 收敛成查表 */
export const TOOL_RPC_METHODS = [
  "fs/read_text_file",
  "fs/write_text_file",
  "terminal/create",
  "terminal/output",
  "terminal/wait_for_exit",
  "terminal/kill",
  "terminal/release",
] as const;

export type ToolRpcMethod = (typeof TOOL_RPC_METHODS)[number];

/** 把 ACP 方法名映射到 bridge 上的执行函数；未知方法返回 null，调用方回空结果 */
export function resolveToolRpc(
  method: string,
  tools: Window["desktop"]["acpTools"],
): ((params: Record<string, unknown>) => Promise<unknown>) | null {
  switch (method) {
    case "fs/read_text_file":
      return tools.fsRead;
    case "fs/write_text_file":
      return tools.fsWrite;
    case "terminal/create":
      return tools.terminalCreate;
    case "terminal/output":
      return tools.terminalOutput;
    case "terminal/wait_for_exit":
      return tools.terminalWait;
    case "terminal/kill":
      return tools.terminalKill;
    case "terminal/release":
      return tools.terminalRelease;
    default:
      return null;
  }
}

/** 权限请求（server_request）的展示态，不含 respond 回调 */
export interface PermissionAsk {
  sessionId: string;
  title: string;
  options: Array<{ optionId: string; name: string; kind: string }>;
}

export function routePermissionRequest(params: Record<string, unknown>): PermissionAsk {
  const toolCall = params.toolCall as { title?: string } | undefined;
  return {
    sessionId: (params.sessionId as string) || "",
    title: toolCall?.title || "请求执行操作",
    options: (params.options as Array<{ optionId: string; name: string; kind: string }>) || [],
  };
}

/** 事件是否是 `session/update` 通知 */
export function isSessionUpdate(
  event: AcpEvent,
): event is Extract<AcpEvent, { type: "notification" }> {
  return event.type === "notification" && event.method === "session/update";
}
