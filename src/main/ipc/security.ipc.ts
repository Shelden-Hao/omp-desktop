/**
 * 审计中心通道：追加、读取、清空、导出。
 */

import { ipcMain } from "electron";
import type { AuditEntry } from "../../shared/types";
import { appendAudit, clearAudit, exportAudit, readAudit } from "../services/audit-service";

export function registerSecurityIpc() {
	ipcMain.handle("audit:list", () => readAudit());
	ipcMain.handle("audit:add", (_e, entry: Partial<AuditEntry>) => appendAudit(entry ?? {}));
	ipcMain.handle("audit:clear", () => clearAudit());
	ipcMain.handle("audit:export", () => exportAudit());
}
