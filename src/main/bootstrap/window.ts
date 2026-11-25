/**
 * 主窗口：无边框 + contextIsolation，渲染层只通过 preload 提供的 bridge 通信。
 */

import { BrowserWindow } from "electron";
import { join } from "node:path";

export function createWindow() {
	const win = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 900,
		minHeight: 600,
		title: "OMP Desktop",
		frame: false,
		webPreferences: {
			preload: join(__dirname, "..", "preload", "index.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	const devUrl = process.env.VITE_DEV_URL;
	if (devUrl) {
		win.loadURL(devUrl);
	} else {
		win.loadFile(join(__dirname, "..", "renderer", "index.html"));
	}
}
