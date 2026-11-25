/**
 * IPC 注册总入口：按域注册，通道实现分散在同目录的 *.ipc.ts。
 */

import { registerAgentIpc } from "./agent.ipc";
import { registerFilesIpc } from "./files.ipc";
import { registerModelsIpc } from "./models.ipc";
import { registerSecurityIpc } from "./security.ipc";
import { registerSessionIpc } from "./session.ipc";
import { registerSettingsIpc } from "./settings.ipc";
import { registerSkillsIpc } from "./skills.ipc";
import { registerSystemIpc } from "./system.ipc";
import { registerWindowIpc } from "./window.ipc";

export function registerIpc() {
	registerWindowIpc();
	registerSettingsIpc();
	registerSessionIpc();
	registerAgentIpc();
	registerFilesIpc();
	registerSkillsIpc();
	registerModelsIpc();
	registerSecurityIpc();
	registerSystemIpc();
}
