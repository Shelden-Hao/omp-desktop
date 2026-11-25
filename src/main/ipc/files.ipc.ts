/**
 * 文件预览通道：选文件用系统对话框，读取校验在工作区服务里做。
 */

import { ipcMain } from "electron";
import { pickTextFile } from "../platform/system";
import { readTextDocument } from "../services/workspace-service";

export function registerFilesIpc() {
	ipcMain.handle("file:open", async () => {
		const filePath = await pickTextFile();
		if (!filePath) return null;
		return readTextDocument(filePath);
	});
	ipcMain.handle("file:read", (_e, filePath: string) => readTextDocument(filePath));
}
