/**
 * 主窗口：无边框 + contextIsolation，渲染层只通过 preload 提供的 bridge 通信。
 *
 * 资源路径一律从 app.getAppPath() 起算，不用 `__dirname` 的相对层级拼——
 * 本文件位于 dist/main/bootstrap 下，多退一层就会指错目录（曾导致白屏）。
 */

import { app, BrowserWindow } from "electron";
import { join } from "node:path";

/** 构建产物根目录：开发态是 <项目根>/dist，打包后是 app.asar/dist */
function distPath(...segments: string[]) {
	return join(app.getAppPath(), "dist", ...segments);
}

export function createWindow() {
	const win = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 900,
		minHeight: 600,
		title: "OMP Desktop",
		frame: false,
		webPreferences: {
			preload: distPath("preload", "index.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	const devUrl = process.env.VITE_DEV_URL;
	if (devUrl) {
		win.loadURL(devUrl);
	} else {
		win.loadFile(distPath("renderer", "index.html"));
	}
}
