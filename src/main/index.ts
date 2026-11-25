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
