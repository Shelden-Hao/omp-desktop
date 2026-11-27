/**
 * 会话领域类型：对话消息、ACP 会话能力（模式/配置项）、本地会话索引。
 * 消息块是界面的渲染单位，也是 ACP 事件归约后的结果。
 */

export type Role = "user" | "agent" | "system";

/** ACP 工具调用里的文件改动：oldText/newText 是该文件改动前/后的完整内容 */
export interface ToolDiff {
  path: string;
  oldText: string | null;
  newText: string;
}

export interface ContentBlock {
  type: "text" | "thinking" | "tool_call" | "tool_result" | "diff" | "other";
  text: string;
  toolName?: string;
  title?: string;
  kind?: string;
  rawInput?: string;
  result?: string;
  status?: "pending" | "completed" | "failed";
  /** 工具调用涉及的文件改动，来自 ACP content 里的 diff 块 */
  diffs?: ToolDiff[];
  /** 工具调用涉及的文件路径，来自 ACP 的 locations */
  locations?: string[];
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
  /** 置顶：纯本地排序偏好，omp 没有对应能力 */
  pinned?: boolean;
  /** 已归档：omp 侧已 session/close，本地标记阻止 session/list 把它加回来；服务端对话文件保留 */
  hidden?: boolean;
}

/** 工作区分组的本地元数据：别名与置顶，存在 sessions.json 的 workspaces 字段 */
export interface StoredWorkspace {
  /** 工作目录绝对路径，分组主键 */
  cwd: string;
  /** 分组显示名，缺省用目录名 */
  name?: string;
  /** 置顶分组排在最前 */
  pinned?: boolean;
}
