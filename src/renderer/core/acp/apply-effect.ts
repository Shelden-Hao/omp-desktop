/**
 * 会话能力态的纯 reducer：ACP 事件只描述「发生了什么」，
 * 怎么折算成 SessionState / ContextReport 在这里决定，便于单独推理与复用。
 */

import type { ContextReport, SessionConfigOption, SessionState } from "../../../shared/types";

export function applyModeEffect(state: SessionState | undefined, modeId: string): SessionState {
  const current = state || { modes: null, configOptions: [] };
  return {
    ...current,
    modes: current.modes ? { ...current.modes, currentModeId: modeId } : null,
  };
}

export function applyConfigEffect(
  state: SessionState | undefined,
  configOptions: SessionConfigOption[],
): SessionState {
  const current = state || { modes: null, configOptions: [] };
  return { ...current, configOptions };
}

/**
 * 用量事件只带总量。已有分项报告时只更新窗口大小；否则先建一份只有总量的。
 * 返回 undefined 表示「无需更新」，避免无意义的 setState。
 */
export function applyUsageEffect(
  report: ContextReport | undefined,
  size: number,
  used: number,
): ContextReport | undefined {
  if (report) {
    if (!size || size === report.contextWindow) return undefined;
    return { ...report, contextWindow: size };
  }
  if (!size) return undefined;
  return {
    contextWindow: size,
    usedTokens: used,
    percent: (used / size) * 100,
    parts: [],
    reservedTokens: 0,
  };
}
