/**
 * 原生主题：只把应用设置里的三档主题映射到 Electron。
 * 系统级能力集中在这一层，services 不直接碰 nativeTheme。
 */

import { nativeTheme } from "electron";
import type { ThemeMode } from "../../shared/types";

export function applyNativeTheme(theme: ThemeMode) {
	nativeTheme.themeSource = theme === "system" ? "system" : theme;
}
