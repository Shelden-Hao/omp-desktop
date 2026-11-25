/**
 * 对话消息列表的纯归约函数。
 * ACP 的 session/update 事件在这里落成消息块，App 只负责把结果塞回 state，
 * 不写「怎么合并流式文本」「工具块怎么定位」这类规则。
 */
import type { ChatMessage, ContentBlock } from "../../shared/types";

export interface AppendBlockResult {
  messages: ChatMessage[];
  /** 新块落在哪条消息上：工具调用的后续状态更新靠它定位 */
  index: number;
}

function createId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** 往最后一条 agent 消息追加块；流式文本与思考合并进同一个块，避免每帧新建节点 */
export function appendBlock(
  messages: ChatMessage[],
  block: ContentBlock,
  now = Date.now(),
): AppendBlockResult {
  const copy = [...messages];
  let index = copy.length - 1;
  if (index < 0 || copy[index].role !== "agent") {
    copy.push({ id: createId(), role: "agent", blocks: [], ts: now });
    index = copy.length - 1;
  }
  const message = copy[index];
  const blocks = [...message.blocks];
  const last = blocks[blocks.length - 1];
  if (last && isStreamBlock(block) && last.type === block.type) {
    blocks[blocks.length - 1] = { ...last, text: last.text + block.text };
  } else {
    blocks.push(block);
  }
  copy[index] = { ...message, blocks };
  return { messages: copy, index };
}

function isStreamBlock(block: ContentBlock): boolean {
  return block.type === "text" || block.type === "thinking";
}

/** 历史回放里的用户消息：追加到最后一条 user 消息，没有就新建 */
export function appendUserChunk(
  messages: ChatMessage[],
  text: string,
  now = Date.now(),
): ChatMessage[] {
  const copy = [...messages];
  const last = copy[copy.length - 1];
  if (last?.role === "user") {
    const blocks = [...last.blocks];
    const tail = blocks[blocks.length - 1];
    if (tail?.type === "text") blocks[blocks.length - 1] = { ...tail, text: tail.text + text };
    else blocks.push({ type: "text", text });
    copy[copy.length - 1] = { ...last, blocks };
    return copy;
  }
  copy.push({ id: createId(), role: "user", blocks: [{ type: "text", text }], ts: now });
  return copy;
}

/** 工具块可被后续 update 覆盖的字段；空值不覆盖已有内容 */
export interface ToolBlockPatch {
  status?: ContentBlock["status"];
  title?: string;
  result?: string;
  diffs?: ContentBlock["diffs"];
  locations?: ContentBlock["locations"];
}

/** 更新某个工具调用块的状态/结果/文件改动；块用 toolCallId 存在 text 里 */
export function updateToolBlock(
  messages: ChatMessage[],
  toolCallId: string,
  patch: ToolBlockPatch,
): ChatMessage[] {
  return messages.map((message) => {
    const hit = message.blocks.some(
      (block) => block.type === "tool_call" && block.text === toolCallId,
    );
    if (!hit) return message;
    return {
      ...message,
      blocks: message.blocks.map((block) =>
        block.type === "tool_call" && block.text === toolCallId
          ? {
              ...block,
              status: patch.status ?? block.status,
              result: patch.result || block.result,
              title: patch.title || block.title,
              diffs: patch.diffs?.length ? patch.diffs : block.diffs,
              locations: patch.locations?.length ? patch.locations : block.locations,
            }
          : block,
      ),
    };
  });
}

/** 一轮结束后补上耗时：用户消息算请求时长，最后一条 agent 消息算生成时长 */
export function stampDurations(
  messages: ChatMessage[],
  userMessageId: string,
  now = Date.now(),
): ChatMessage[] {
  const copy = messages.map((item) =>
    item.id === userMessageId ? { ...item, durationMs: now - item.ts } : item,
  );
  for (let i = copy.length - 1; i >= 0; i -= 1) {
    if (copy[i].role === "agent") {
      copy[i] = { ...copy[i], durationMs: now - copy[i].ts };
      break;
    }
  }
  return copy;
}
