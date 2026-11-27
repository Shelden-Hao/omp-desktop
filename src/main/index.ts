/**
 * 应用入口：只做装配 —— 注入 agent 输出、注册 IPC、开窗口、管生命周期。
 * 系统能力在 platform/，业务编排在 services/，通道在 ipc/，这里不放实现细节。
 */

import { app, BrowserWindow } from "electron";
import { createWindow } from "./bootstrap/window";
import { sendToRenderer } from "./ipc/broadcast";
import { registerIpc } from "./ipc";
import { setAgentOutput, stopAgent } from "./services/agent-service";
import { applyRuntimeSettings, getSettings, hostSettings } from "./services/settings-service";
import { updateAllInstalledSkills } from "./services/skill-service";

/**
 * 单实例：第二个进程拿不到锁就立即退出，同时把已有实例的窗口唤到前台。
 * 双开会各起一个 omp 进程抢同一份会话存储，必须在入口就挡住。
 */
if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on("second-instance", () => {
		const win = BrowserWindow.getAllWindows()[0];
		if (!win) return;
		// 只有窗口被最小化（用户完全看不到）时才恢复并聚焦。
		// 可见时不碰：双击桌面图标会先把焦点给桌面，isFocused 必为 false，
		// 若据此 focus 会让本就在前台的窗口闪一下。
		// 被其他窗口遮挡时，用户可点任务栏图标唤回，不由这里抢焦点。
		if (win.isMinimized()) {
			win.restore();
			win.focus();
		}
	});
}

app.whenReady().then(() => {
	// 帧/日志/退出统一广播到所有窗口；窗口未就绪时事件丢弃。
	setAgentOutput({
		frame: (line) => sendToRenderer("acp:frame", line),
		stderr: (text) => sendToRenderer("acp:stderr", text),
		exit: (code) => sendToRenderer("acp:exit", code),
	});

	registerIpc();
	void applyRuntimeSettings(false);

	if (getSettings().autoUpdateSkills) {
		// 启动后稍等再做，避免和窗口/会话初始化争抢 IO
		setTimeout(() => {
			void updateAllInstalledSkills(hostSettings()).catch((error) =>
				console.error("auto skill update failed", error),
			);
		}, 1500);
	}

	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

let quitting = false;

app.on("window-all-closed", async () => {
	if (process.platform === "darwin") return;
	// 关窗前先让 omp 优雅退出，会话落盘后再退出应用
	if (!quitting) {
		quitting = true;
		await stopAgent();
	}
	app.quit();
});
