/**
 * 一轮过程的一行摘要：折叠后让用户扫一眼就知道这轮做了什么，
 * 例如「思考 3 次 · 2 条命令 · 读取文件 1 次」。
 */

import type { ContentBlock } from "../../shared/types";

const ORDER = [
  "execute",
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "fetch",
  "think",
  "switch_mode",
  "other",
] as const;

const VERB: Record<string, string> = {
  execute: "命令",
  read: "读取",
  edit: "编辑",
  delete: "删除",
  move: "移动",
  search: "搜索",
  fetch: "获取",
  think: "整理",
  switch_mode: "切换",
  other: "工具",
};

export function summarizeProcess(blocks: ContentBlock[]): string {
  let thinking = 0;
  const tools = new Map<string, number>();
  for (const block of blocks) {
    if (block.type === "thinking") {
      if (block.text.trim()) thinking += 1;
      continue;
    }
    if (block.type !== "tool_call") continue;
    const kind = block.kind && VERB[block.kind] ? block.kind : "other";
    tools.set(kind, (tools.get(kind) ?? 0) + 1);
  }

  const parts: string[] = [];
  if (thinking > 0) parts.push(`思考 ${thinking} 次`);
  for (const kind of ORDER) {
    const count = tools.get(kind);
    if (!count) continue;
    const verb = VERB[kind];
    parts.push(kind === "execute" ? `${count} 条${verb}` : `${verb} ${count} 次`);
  }
  return parts.join(" · ");
}
