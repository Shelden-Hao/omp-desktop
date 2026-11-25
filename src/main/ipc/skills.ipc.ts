/**
 * 技能管理通道：命令全部委托给 omp CLI，返回结构化结果。
 */

import { ipcMain } from "electron";
import type { SkillCreateInput, SkillScope } from "../../shared/types";
import {
	createSkill,
	getSkillConfigValue,
	getSkillPaths,
	installSkill,
	listSkills,
	publishSkill,
	searchSkills,
	setSkillEnabled,
	showSkillInfo,
	skillCall,
	skillCommand,
	uninstallSkill,
	updateAllInstalledSkills,
} from "../services/skill-service";
import { getSettings, hostSettings } from "../services/settings-service";

export function registerSkillsIpc() {
	ipcMain.handle("skills:list", (_e, cwd?: string) =>
		skillCall(() => listSkills(hostSettings(), cwd || getSettings().cwd)),
	);
	ipcMain.handle("skills:search", (_e, query: string, sort: "relevance" | "downloads" | "recent") =>
		skillCall(() => searchSkills(hostSettings(), query, sort)),
	);
	ipcMain.handle("skills:info", (_e, spec: string) =>
		skillCall(() => showSkillInfo(hostSettings(), spec)),
	);
	ipcMain.handle("skills:install", (_e, spec: string, scope: SkillScope) =>
		skillCommand(() => installSkill(hostSettings(), spec, scope)),
	);
	ipcMain.handle("skills:uninstall", (_e, name: string, scope: SkillScope) =>
		skillCommand(() => uninstallSkill(hostSettings(), name, scope)),
	);
	ipcMain.handle("skills:publish", (_e, dir: string, scope: string) =>
		skillCommand(() => publishSkill(hostSettings(), dir, scope)),
	);
	ipcMain.handle("skills:enabled", (_e, name: string, enabled: boolean) =>
		skillCall(() => setSkillEnabled(hostSettings(), name, enabled)),
	);
	ipcMain.handle("skills:config", (_e, key: string) =>
		skillCall(() => getSkillConfigValue(hostSettings(), key)),
	);
	ipcMain.handle("skills:paths", () => skillCall(() => getSkillPaths(hostSettings())));
	ipcMain.handle("skills:update-all", () => updateAllInstalledSkills(hostSettings()));
	ipcMain.handle("skills:create", (_e, input: SkillCreateInput) =>
		skillCall(() => createSkill(hostSettings(), input)),
	);
}
