/**
 * 一轮对话的发起与中断：敏感信息拦截、失效会话重绑、耗时回写、上下文刷新。
 *
 * 与连接层分开的原因：连接层回答「omp 进程是否可用」，这里回答「这条消息怎么发出去」，
 * 两者出错时的排查方向完全不同。
 */

import { useCallback, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { ChatMessage, DesktopSettings } from "../../shared/types";
import { isStaleSessionError } from "../core/acp/client";
import { detectSensitive } from "../core/security/sensitive";
import { stampDurations } from "../core/session-reducer";
import type { AgentConnection, AuditLogger } from "./use-agent-connection";
import type { useComposerEditor } from "./use-composer-editor";
import type { MessageStore } from "./use-message-store";

type ComposerApi = ReturnType<typeof useComposerEditor>;

interface AgentPromptOptions {
  connection: AgentConnection;
  store: MessageStore;
  composer: ComposerApi;
  /** 发送后把视图贴到底部 */
  stickToBottom: () => void;
  settings: DesktopSettings;
  runningRef: MutableRefObject<boolean>;
  setRunning: (value: boolean) => void;
  logAudit: AuditLogger;
}

export interface SensitiveHit {
  label: string;
  text: string;
}

export interface AgentPrompt {
  sensitiveHit: SensitiveHit | null;
  setSensitiveHit: (hit: SensitiveHit | null) => void;
  send: (override?: string, confirmed?: boolean) => Promise<void>;
  cancel: () => void;
  retryMessage: (message: ChatMessage) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function useAgentPrompt({
  connection,
  store,
  composer,
  stickToBottom,
  settings,
  runningRef,
  setRunning,
  logAudit,
}: AgentPromptOptions): AgentPrompt {
  /** 敏感信息拦截：命中后暂停发送，等用户确认 */
  const [sensitiveHit, setSensitiveHit] = useState<SensitiveHit | null>(null);
  const cancelledSessionRef = useRef<string | null>(null);
  const { client, activeId, sessions, setActiveId, rebindSession, probeContext, contextBusyRef } =
    connection;
  const { updateMessages } = store;

  const send = useCallback(
    async (override?: string, confirmed = false) => {
      // inline chip 已在 readEditorText 里还原成 omp 认识的 /skill:<name>；重试走 override 不再读输入区
      const text = (override ?? composer.readText()).trim();
      // 正在刷新上下文用量时先让出，避免两个 prompt 并发打到同一会话
      if (!client || !activeId || !text || runningRef.current || contextBusyRef.current) return;
      if (!confirmed && settings.sensitiveGuard) {
        const hit = detectSensitive(text);
        if (hit) {
          setSensitiveHit({ label: hit, text });
          void logAudit({
            category: "敏感保护",
            action: "发送前拦截疑似敏感信息",
            detail: hit,
            level: "block",
          });
          return;
        }
      }
      const sessionId = activeId;
      const startedAt = Date.now();
      const userMessageId = uid();
      if (override === undefined) composer.clear();
      composer.skillSuggest.close();
      composer.resourceSuggest.close();
      stickToBottom();
      updateMessages(sessionId, (prev) => [
        ...prev,
        { id: userMessageId, role: "user", blocks: [{ type: "text", text }], ts: startedAt },
      ]);
      setRunning(true);
      const sessionCwd = sessions.find((item) => item.id === sessionId)?.cwd || settings.cwd;
      // omp 重启后这个会话可能已失效，绑定 id 跟着重绑结果走，消息落到真正发出请求的会话上
      let boundId = sessionId;
      try {
        try {
          await client.prompt(boundId, text);
        } catch (error) {
          if (!isStaleSessionError(error)) throw error;
          connection.setStatus("原会话在 omp 重启后失效，已新建会话继续");
          boundId = await rebindSession(client, sessionId, sessionCwd);
          setActiveId(boundId);
          await client.prompt(boundId, text);
        }
      } catch (error) {
        if (cancelledSessionRef.current === sessionId) {
          cancelledSessionRef.current = null;
          return;
        }
        updateMessages(boundId, (prev) => [
          ...prev,
          {
            id: uid(),
            role: "system",
            blocks: [{ type: "text", text: `请求失败：${(error as Error).message}` }],
            ts: Date.now(),
          },
        ]);
      } finally {
        if (cancelledSessionRef.current === sessionId) cancelledSessionRef.current = null;
        updateMessages(boundId, (prev) => stampDurations(prev, userMessageId));
        setRunning(false);
        composer.focus();
        // 一轮结束后刷新上下文占用（工具输出、消息都会变化）
        void probeContext(boundId);
      }
    },
    [
      activeId,
      client,
      composer,
      connection,
      contextBusyRef,
      logAudit,
      probeContext,
      rebindSession,
      runningRef,
      sessions,
      setActiveId,
      setRunning,
      settings.cwd,
      settings.sensitiveGuard,
      stickToBottom,
      updateMessages,
    ],
  );

  const cancel = useCallback(() => {
    if (!client || !activeId) return;
    cancelledSessionRef.current = activeId;
    client.cancel(activeId);
    const pending = connection.pendingPermissionRef.current;
    if (pending?.sessionId === activeId) {
      pending.respond({ outcome: { outcome: "cancelled" } });
      connection.setPermission(null);
    }
    setRunning(false);
  }, [activeId, client, connection, setRunning]);

  const retryMessage = useCallback(
    (message: ChatMessage) => {
      const text = message.blocks
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      if (text) void send(text);
    },
    [send],
  );

  return { sensitiveHit, setSensitiveHit, send, cancel, retryMessage };
}
