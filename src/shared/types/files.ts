/**
 * 文件与系统能力类型：ACP 回调、文件预览、MCP 配置、缓存目录信息。
 */

export interface OpenedFile {
  path: string;
  name: string;
  content: string;
  language: string;
}

export interface ToolResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** omp MCP 连接器配置（主进程只读汇总，见 main/services/mcp-service.ts） */
export interface McpServerInfo {
  name: string;
  scope: "user" | "project";
  source: string;
  enabled: boolean;
  transport: string;
}

export interface McpConfigInfo {
  servers: McpServerInfo[];
  paths: Array<{ scope: "user" | "project"; path: string; exists: boolean }>;
}

export interface SystemInfoData {
  cacheDir: string;
  usedBytes: number;
  totalBytes: number;
  availableBytes: number;
  openAtLogin: boolean;
}

/** `/context` 命令解析结果，全部来自 omp 真实统计 */
export interface ContextPart {
  key: string;
  label: string;
  tokens: number;
  percent: number;
}

export interface ContextReport {
  contextWindow: number;
  percent: number;
  usedTokens: number;
  parts: ContextPart[];
  reservedTokens: number;
}
