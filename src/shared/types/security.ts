/**
 * 安全与审计类型：审计条目落在 userData/audit.jsonl，
 * 条目内容只能来自客户端真实发生的动作。
 */

export interface AuditEntry {
  ts: number;
  category: string;
  action: string;
  detail: string;
  level: "info" | "warn" | "block";
}

/** 审计导出结果 */
export interface AuditExportResult {
  ok: boolean;
  path?: string;
  error?: string;
}
