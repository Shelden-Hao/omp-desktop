/**
 * 会话消息仓库：所有消息数组的读写都走这里。
 * 组件层只拿 messagesBySession 渲染，写入只暴露 append / update 的语义化方法，
 * 避免各处手动拼 `{...prev, [id]: ...}`。
 */

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage, ContentBlock } from "../../shared/types";
import {
  appendBlock as reduceAppendBlock,
  appendUserChunk as reduceAppendUserChunk,
  type ToolBlockPatch,
  updateToolBlock,
} from "../core/session-reducer";

export interface MessageStore {
  messagesBySession: Record<string, ChatMessage[]>;
  setMessagesBySession: React.Dispatch<React.SetStateAction<Record<string, ChatMessage[]>>>;
  /** 消息镜像：loadSessionHistory 清空前先留一份，omp 回放不出历史时用它兜底 */
  messagesRef: React.RefObject<Record<string, ChatMessage[]>>;
  updateMessages: (sessionId: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  appendBlock: (sessionId: string, block: ContentBlock) => void;
  appendUserChunk: (sessionId: string, text: string) => void;
  updateToolCall: (sessionId: string, toolCallId: string, patch: ToolBlockPatch) => void;
}

export function useMessageStore(): MessageStore {
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({});
  const messagesRef = useRef<Record<string, ChatMessage[]>>({});

  // 镜像必须在清空之前就位，否则 loadSessionHistory 拿不到上一份内容做兜底
  useLayoutEffect(() => {
    messagesRef.current = messagesBySession;
  }, [messagesBySession]);

  const updateMessages = useCallback(
    (sessionId: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setMessagesBySession((prev) => ({ ...prev, [sessionId]: updater(prev[sessionId] || []) }));
    },
    [],
  );

  const appendBlock = useCallback(
    (sessionId: string, block: ContentBlock) => {
      updateMessages(sessionId, (prev) => reduceAppendBlock(prev, block).messages);
    },
    [updateMessages],
  );

  const appendUserChunk = useCallback(
    (sessionId: string, text: string) => {
      updateMessages(sessionId, (prev) => reduceAppendUserChunk(prev, text));
    },
    [updateMessages],
  );

  const updateToolCall = useCallback(
    (sessionId: string, toolCallId: string, patch: ToolBlockPatch) => {
      updateMessages(sessionId, (prev) => updateToolBlock(prev, toolCallId, patch));
    },
    [updateMessages],
  );

  return {
    messagesBySession,
    setMessagesBySession,
    messagesRef,
    updateMessages,
    appendBlock,
    appendUserChunk,
    updateToolCall,
  };
}
