/**
 * 主进程 → 渲染层的广播。只有 IPC/bootstrap 层可以持有窗口引用，
 * services 通过 agent-service 注入的 sink 把事件交到这里。
 */

import { BrowserWindow } from "electron";

export function sendToRenderer(channel: string, payload: string) {
	for (const win of BrowserWindow.getAllWindows()) {
		win.webContents.send(channel, payload);
	}
}
