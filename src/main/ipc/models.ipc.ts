/**
 * 模型与 omp 配置通道：自定义模型读写 models.yml，辅助角色与其它键走 config set。
 */

import { ipcMain } from "electron";
import { ompConfigPath, readOmpConfig, writeOmpConfig } from "../services/omp-config-service";
import {
	deleteCustomModel,
	listCustomModels,
	saveCustomModel,
	testModelConnection,
	type ModelInput,
} from "../services/model-service";
import { readModelContexts } from "../services/model-context-service";
import { hostSettings } from "../services/settings-service";

export function registerModelsIpc() {
	ipcMain.handle("omp:config", () => ({ ...readOmpConfig(), configPath: ompConfigPath() }));
	ipcMain.handle("omp:set-config", (_e, entries: Array<[string, string]>) =>
		writeOmpConfig(hostSettings(), Array.isArray(entries) ? entries : []),
	);

	ipcMain.handle("models:list", () => listCustomModels());
	ipcMain.handle("models:save", (_e, input: ModelInput) => saveCustomModel(input));
	ipcMain.handle("models:remove", (_e, provider: string, id: string) =>
		deleteCustomModel(provider, id),
	);
	ipcMain.handle("models:test", (_e, input: { baseUrl: string; apiKey: string; model: string }) =>
		testModelConnection(input),
	);
	ipcMain.handle("models:context", () => readModelContexts());
	ipcMain.handle("models:set-role", (_e, role: string, value: string) => {
		if (!/^[a-zA-Z]+$/.test(role)) return { ok: false, error: "角色名不合法" };
		return writeOmpConfig(hostSettings(), [[`modelRoles.${role}`, value]]);
	});
}
