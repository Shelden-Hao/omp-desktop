/**
 * 本地会话索引通道：只存 id/标题/目录/时间。
 */

import { ipcMain } from "electron";
import type { StoredSession } from "../../shared/types";
import { loadSessions, saveSessions } from "../services/session-service";

export function registerSessionIpc() {
	ipcMain.handle("sessions:get", () => loadSessions());
	ipcMain.handle("sessions:set", (_e, next: StoredSession[]) => {
		saveSessions(next);
		return next;
	});
}
