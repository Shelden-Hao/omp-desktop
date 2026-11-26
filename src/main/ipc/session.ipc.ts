/**
 * 本地会话索引通道：会话列表（id/标题/目录/时间）与工作区分组元数据（别名/置顶）。
 */

import { ipcMain } from "electron";
import type { StoredSession, StoredWorkspace } from "../../shared/types";
import {
	loadSessions,
	loadWorkspaces,
	saveSessions,
	saveWorkspaces,
} from "../services/session-service";

export function registerSessionIpc() {
	ipcMain.handle("sessions:get", () => loadSessions());
	ipcMain.handle("sessions:set", (_e, next: StoredSession[]) => {
		saveSessions(next);
		return next;
	});
	ipcMain.handle("workspaces:get", () => loadWorkspaces());
	ipcMain.handle("workspaces:set", (_e, next: StoredWorkspace[]) => {
		saveWorkspaces(next);
		return next;
	});
}
