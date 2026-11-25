/**
 * 系统能力通道：缓存目录信息、运行时探测、打开路径、链接策略、MCP 配置。
 */

import { ipcMain } from "electron";
import {
	getSystemInfo,
	openLink,
	openPath,
	pickDirectory,
	detectRuntimes,
} from "../platform/system";
import { listMcpServers } from "../services/mcp-service";
import { readOmpConfig } from "../services/omp-config-service";
import { getSettings } from "../services/settings-service";

export function registerSystemIpc() {
	ipcMain.handle("system:info", () => getSystemInfo());
	ipcMain.handle("system:runtimes", () => detectRuntimes(readOmpConfig().shellPath));
	ipcMain.handle("system:open-path", (_e, path: string) => openPath(path));
	ipcMain.handle("system:pick-directory", () => pickDirectory());
	ipcMain.handle("links:open", (_e, url: string) => openLink(url, getSettings().linkOpenMode));
	ipcMain.handle("mcp:list", () => listMcpServers(getSettings().cwd));
}
