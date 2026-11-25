/**
 * 解析 omp `/context` 的纯文本输出。官方没有结构化字段，
 * 这里只做格式解析，数值全部来自 omp 自身统计。
 */

import type { ContextReport } from "../../shared/types";

/** omp `/context` 输出里的分段名称 → 中文 */
const CONTEXT_PART_LABEL: Record<string, string> = {
  "system prompt": "系统提示词",
  "system tools": "工具",
  "system context": "系统上下文",
  "instruction files": "指令文件",
  skills: "技能",
  messages: "对话消息",
  "tool output": "工具输出",
  "auto-compact buf": "自动压缩预留",
  free: "空闲",
};

/**
 * 输入形如：
 *   Context window: 1032192 tokens (16% used)
 *     System prompt    [░░░] 0%  1731 tokens
 */
export function parseContextReport(text: string): ContextReport | null {
  if (!text.includes("Context window")) return null;
  const windowMatch = text.match(/Context window:\s*([\d,]+)\s*tokens/i);
  if (!windowMatch) return null;
  const contextWindow = Number(windowMatch[1].replace(/,/g, ""));
  if (!contextWindow) return null;

  const parts: ContextReport["parts"] = [];
  let reservedTokens = 0;
  for (const line of text.split("\n")) {
    const match = line.match(/^\s+(.+?)\s+\[[^\]]*\]\s*\d+%\s+([\d,]+)\s+tokens\s*$/);
    if (!match) continue;
    const rawName = match[1].trim();
    const key = rawName.toLowerCase();
    const tokens = Number(match[2].replace(/,/g, ""));
    if (key === "free") continue;
    if (key === "auto-compact buf") {
      reservedTokens = tokens;
      continue;
    }
    parts.push({
      key,
      label: CONTEXT_PART_LABEL[key] || rawName,
      tokens,
      percent: (tokens / contextWindow) * 100,
    });
  }
  if (!parts.length) return null;

  const usedTokens = parts.reduce((sum, part) => sum + part.tokens, 0);
  return {
    contextWindow,
    usedTokens,
    percent: (usedTokens / contextWindow) * 100,
    parts,
    reservedTokens,
  };
}
