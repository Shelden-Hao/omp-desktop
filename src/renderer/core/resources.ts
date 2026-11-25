/**
 * `@` 联想候选：全部来自真实数据（已打开文档、本会话工具调用出现过的路径、
 * 本会话出现过的网址、用户正在键入的网址），不生成臆造的路径。
 */

import type { ChatMessage } from "../../shared/types";

/** 发送到 omp 的真实文本：文件为 @path（含空格加引号），网址为裸 URL */
export interface ResourceCandidate {
  value: string;
  /** chip 上显示的名字：文件名或域名 */
  label: string;
  /** 联想面板的来源分类 */
  group: "对话中的文件" | "对话中的资源" | "网址";
  detail: string;
}

/** 从工具调用参数/标题里抽取真实出现过的文件路径（不是臆造的候选） */
export function extractPathsFromMessages(messages: ChatMessage[]): string[] {
  const paths = new Set<string>();
  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    // 常见字段：path/filePath/file_path；兼容整段参数里出现的绝对路径
    const matches = value.match(/(?:[A-Za-z]:[\\/][^\s"',;}\]]+|(?:\.{0,2}\/|~\/)[\w./-]+)/g);
    for (const item of matches ?? []) {
      const clean = item.replace(/[)\]}>]+$/, "");
      if (clean.length > 3) paths.add(clean);
    }
  };
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type !== "tool_call" && block.type !== "tool_result") continue;
      push(block.title);
      push(block.rawInput);
      push(block.result);
    }
  }
  return [...paths];
}

/** 从对话文本里抽取真实出现过的网址 */
export function extractUrlsFromMessages(messages: ChatMessage[]): string[] {
  const urls = new Set<string>();
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type !== "text" && block.type !== "tool_result") continue;
      for (const match of block.text.match(/https?:\/\/[^\s<>"')\]}]+/g) ?? []) {
        urls.add(match.replace(/[.,;:]+$/, ""));
      }
    }
  }
  return [...urls];
}

export function urlLabel(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url.length > 28 ? `${url.slice(0, 28)}…` : url;
  }
}
