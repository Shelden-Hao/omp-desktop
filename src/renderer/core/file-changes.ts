/**
 * 会话里「生成或修改了文件」的抽取：编辑走 ACP 的 diff，写入走 tool 的输入参数。
 * 只用于右侧文件预览的自动跟随，不参与对话渲染。
 */

import type { ChatMessage, ContentBlock, ToolDiff } from "../../shared/types";

export interface FileChange {
  path: string;
  content: string;
}

/** 会话消息里按 toolCallId 找工具块（后出现的优先） */
export function findToolBlock(
  messages: ChatMessage[] | undefined,
  toolCallId: string,
): ContentBlock | undefined {
  if (!messages) return undefined;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const blocks = messages[i].blocks;
    for (let j = blocks.length - 1; j >= 0; j -= 1) {
      const block = blocks[j];
      if (block.type === "tool_call" && block.text === toolCallId) return block;
    }
  }
  return undefined;
}

/** 从 JSON 输入里读 path/content；不是这两个字段的结构返回 null */
function readWriteInput(rawInput: string | undefined): FileChange | null {
  if (!rawInput) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (!("path" in parsed) || !("content" in parsed)) return null;
  const { path, content } = parsed;
  if (typeof path !== "string" || !path || typeof content !== "string") return null;
  return { path, content };
}

/**
 * 一次工具更新带来的文件变化：
 * - edit 类：取最后一个 diff 的新内容（多文件时预览最后改动的那个）
 * - write 类：完成时用输入里的 path/content
 */
export function fileChangeFromUpdate(
  diffs: ToolDiff[] | undefined,
  status: ContentBlock["status"],
  block: ContentBlock | undefined,
): FileChange | null {
  if (diffs?.length) {
    const last = diffs[diffs.length - 1];
    return { path: last.path, content: last.newText };
  }
  if (status !== "completed" || !block) return null;
  if (!/write|create/i.test(block.toolName ?? "")) return null;
  return readWriteInput(block.rawInput);
}

export function fileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}
