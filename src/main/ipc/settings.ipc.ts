/**
 * 设置的读写通道。
 * 保存时先落本地，再把差异同步到 omp 配置；同步失败不回滚本地设置，
 * 但把原因带回渲染层，避免「看起来生效、其实没写进去」。
 */

import { ipcMain } from "electron";
import type { DesktopSettings } from "../../shared/types";
import { isAgentRunning } from "../services/agent-service";
import { applySettingsToOmp } from "../services/omp-config-service";
import {
	applyRuntimeSettings,
	getSettings,
	hostSettings,
	updateSettings,
} from "../services/settings-service";

export function registerSettingsIpc() {
	ipcMain.handle("settings:get", () => getSettings());
	ipcMain.handle("settings:set", async (_e, next: Partial<DesktopSettings>) => {
		const settings = updateSettings(next ?? {});
		await applyRuntimeSettings(isAgentRunning());
		const sync = await applySettingsToOmp(settings, hostSettings());
		if (!sync.ok) console.error("apply omp settings failed", sync.error);
		return { ...settings, ompSyncError: sync.ok ? "" : (sync.error ?? "同步 omp 配置失败") };
	});
}
