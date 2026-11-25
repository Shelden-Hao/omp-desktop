/**
 * 会话领域类型：对话消息、ACP 会话能力（模式/配置项）、本地会话索引。
 * 消息块是界面的渲染单位，也是 ACP 事件归约后的结果。
 */

export type Role = "user" | "agent" | "system";

export interface ContentBlock {
  type: "text" | "thinking" | "tool_call" | "tool_result" | "diff" | "other";
  text: string;
  toolName?: string;
  title?: string;
  kind?: string;
  rawInput?: string;
  result?: string;
  status?: "pending" | "completed" | "failed";
  raw?: unknown;
}

export interface ChatMessage {
  id: string;
  role: Role;
  blocks: ContentBlock[];
  ts: number;
  durationMs?: number;
}

export interface PermissionRequest {
  toolCallId: string;
  title: string;
  options: Array<{ optionId: string; name: string; kind: string }>;
}

/** ACP 会话模式（运行模式切换） */
export interface SessionMode {
  id: string;
  name: string;
  description?: string | null;
}

export interface SessionModeState {
  currentModeId: string;
  availableModes: SessionMode[];
}

/** ACP 会话配置选项（模型选择、思考强度等） */
export interface SessionConfigOption {
  id: string;
  name: string;
  description?: string | null;
  category?: "mode" | "model" | "model_config" | "thought_level" | string | null;
  type: "select" | "boolean";
  currentValue?: string;
  currentBoolean?: boolean;
  options?: Array<{ value: string; name: string; description?: string | null }>;
}

export interface SessionState {
  modes: SessionModeState | null;
  configOptions: SessionConfigOption[];
}

/** 本地会话索引，落 sessions.json，用于重启后恢复列表 */
export interface StoredSession {
  id: string;
  title: string;
  cwd: string;
  ts?: number;
}
