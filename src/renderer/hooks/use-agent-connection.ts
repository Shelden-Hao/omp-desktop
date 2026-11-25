/* eslint-disable react/set-state-in-effect, react/exhaustive-effect-dependencies -- 连接只在 epoch 变化时重建，其余依赖（setSettings / setRunning / 稳定的 useCallback）由外部注入；effect 内同步 setStatus 只用于 preload 缺失这类致命错误，只跑一次 */
/**
 * ACP 连接层：进程生命周期、事件分发、会话索引与历史加载。
 *
 * 职责边界：
 * - 拥有 client / 连接态 / 会话列表 / 每个会话的能力态（模式、配置项）/ 上下文用量
 * - 不关心输入区、预览栏、设置面板这些界面态
 * - `epoch` 变化即重连：切换安全等级只能靠重启 omp 进程生效
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { AcpEvent } from "../../shared/protocol";
import type {
  ApprovalMode,
  AuditEntry,
  ContextReport,
  DesktopSettings,
  SessionState,
  StoredSession,
} from "../../shared/types";
import { AcpClient, isStaleSessionError, normalizeSessionState } from "../core/acp/client";
import {
  type PermissionAsk,
  resolveToolRpc,
  routePermissionRequest,
  routeSessionUpdate,
} from "../core/acp/event-router";
import { applyConfigEffect, applyModeEffect, applyUsageEffect } from "../core/acp/apply-effect";
import { parseContextReport } from "../core/context-report";
import { loadSessionIndex } from "../core/session-boot";
import { APPROVAL_LABEL } from "../core/labels";
import type { Session } from "../core/session-filters";
import type { MessageStore } from "./use-message-store";

export interface PermissionState extends PermissionAsk {
  respond: (result: unknown) => void;
}

export type AuditLogger = (entry: Partial<AuditEntry>) => Promise<unknown> | void;

interface AgentConnectionOptions {
  store: MessageStore;
  runningRef: RefObject<boolean>;
  setRunning: (value: boolean) => void;
  settingsRef: RefObject<DesktopSettings | null>;
  setSettings: Dispatch<SetStateAction<DesktopSettings>>;
  logAudit: AuditLogger;
}

export interface AgentConnection {
  client: AcpClient | null;
  clientRef: RefObject<AcpClient | null>;
  connected: boolean;
  status: string;
  setStatus: (text: string) => void;
  stderrLog: string[];
  sessions: Session[];
  setSessions: Dispatch<SetStateAction<Session[]>>;
  activeId: string | null;
  setActiveId: Dispatch<SetStateAction<string | null>>;
  activeIdRef: RefObject<string | null>;
  sessionStates: Record<string, SessionState>;
  setSessionStates: Dispatch<SetStateAction<Record<string, SessionState>>>;
  contextReports: Record<string, ContextReport>;
  setContextReports: Dispatch<SetStateAction<Record<string, ContextReport>>>;
  permission: PermissionState | null;
  setPermission: Dispatch<SetStateAction<PermissionState | null>>;
  pendingPermissionRef: RefObject<PermissionState | null>;
  /** `/context` 采集期间为 true，发送请求需要让出 */
  contextBusyRef: RefObject<boolean>;
  probeContext: (sessionId: string, target?: AcpClient | null) => Promise<void>;
  loadSessionHistory: (acp: AcpClient, sessionId: string, cwd: string) => Promise<void>;
  rebindSession: (acp: AcpClient, oldId: string, cwd: string) => Promise<string>;
  selectSession: (session: Session) => Promise<void>;
  newSession: () => Promise<void>;
  /** 重命名只改本地索引标题，omp 里的会话标题不受影响 */
  renameSession: (id: string, title: string) => void;
  togglePin: (id: string) => void;
  /** 仅从列表移除：omp 对话记录保留，靠 hidden 标记避免 session/list 加回来 */
  deleteSession: (session: Session) => Promise<void>;
  changeApprovalMode: (mode: ApprovalMode) => Promise<void>;
}

export function useAgentConnection({
  store,
  runningRef,
  setRunning,
  settingsRef,
  setSettings,
  logAudit,
}: AgentConnectionOptions): AgentConnection {
  const [client, setClient] = useState<AcpClient | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("准备连接 omp…");
  const [stderrLog, setStderrLog] = useState<string[]>([]);
  const [sessionStates, setSessionStates] = useState<Record<string, SessionState>>({});
  const [contextReports, setContextReports] = useState<Record<string, ContextReport>>({});
  const [permission, setPermission] = useState<PermissionState | null>(null);
  /** 变化即重连（切换安全等级） */
  const [epoch, setEpoch] = useState(0);

  const clientRef = useRef<AcpClient | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const loadedSessions = useRef<Set<string>>(new Set());
  const pendingPermissionRef = useRef<PermissionState | null>(null);
  /** 已从列表移除的会话记录：persist 时一并写回，重启后仍能挡住 session/list */
  const hiddenRef = useRef<StoredSession[]>([]);
  /** 正在静默采集 `/context` 输出时指向该会话，期间的 chunk 不进对话 */
  const silentContextRef = useRef<{ sessionId: string; text: string } | null>(null);
  const contextBusyRef = useRef(false);

  const { setMessagesBySession, messagesRef, appendBlock, appendUserChunk, updateToolCall } = store;

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    pendingPermissionRef.current = permission;
  }, [permission]);

  const persistSessions = useCallback(async (next: Session[]) => {
    try {
      const loaded = await window.desktop.settings.get();
      await window.desktop.sessions.set([
        ...next.map((session) => ({
          id: session.id,
          title: session.title,
          cwd: session.cwd || loaded.cwd,
          ts: session.ts || Date.now(),
          ...(session.pinned ? { pinned: true } : {}),
        })),
        ...hiddenRef.current,
      ]);
    } catch (error) {
      setStatus(`会话保存失败：${(error as Error).message}`);
    }
  }, []);

  /**
   * 向当前会话静默发送 `/context`，解析出真实的分段用量。
   * 命令在 omp 侧是本地执行的，不产生模型请求也不写进 transcript，
   * 因此可以随时刷新，不会污染对话。
   */
  const probeContext = useCallback(
    async (sessionId: string, target?: AcpClient | null) => {
      const acp = target ?? clientRef.current;
      if (!acp || runningRef.current || contextBusyRef.current) return;
      if (silentContextRef.current) return;
      const box = { sessionId, text: "" };
      silentContextRef.current = box;
      contextBusyRef.current = true;
      try {
        await acp.prompt(sessionId, "/context");
      } catch {
        // 旧版 omp 没有 /context 命令时静默失败，面板退化到只显示总量
      } finally {
        if (silentContextRef.current === box) silentContextRef.current = null;
        contextBusyRef.current = false;
      }
      const parsed = parseContextReport(box.text);
      if (parsed) setContextReports((prev) => ({ ...prev, [sessionId]: parsed }));
    },
    [runningRef],
  );

  const loadSessionHistory = useCallback(
    async (acp: AcpClient, sessionId: string, cwd: string) => {
      if (loadedSessions.current.has(sessionId)) return;
      loadedSessions.current.add(sessionId);
      const local = messagesRef.current[sessionId] ?? [];
      setMessagesBySession((prev) => ({ ...prev, [sessionId]: [] }));
      try {
        const loaded = await acp.loadSession(sessionId, cwd);
        setSessionStates((prev) => ({ ...prev, [sessionId]: normalizeSessionState(loaded) }));
        // omp 重启后常常回放不出内容，这时宁可显示本地已有的对话，也不要给用户一片空白
        setMessagesBySession((prev) =>
          prev[sessionId]?.length || local.length === 0 ? prev : { ...prev, [sessionId]: local },
        );
      } catch (error) {
        setMessagesBySession((prev) => ({ ...prev, [sessionId]: local }));
        // omp 重启后旧 sessionId 不再存在：历史捞不回来，但会话仍可用（发消息时自动重绑）
        if (isStaleSessionError(error)) {
          setStatus("该会话在 omp 重启前创建，历史无法恢复；发送消息会自动新建会话");
          return;
        }
        setStatus(`恢复会话失败：${(error as Error).message}`);
      }
    },
    [messagesRef, setMessagesBySession],
  );

  const handleEvent = useCallback(
    (event: AcpEvent) => {
      if (event.type === "notification") {
        if (event.method !== "session/update") return;
        const effect = routeSessionUpdate(
          event.params as Record<string, unknown>,
          activeIdRef.current,
        );
        if (!effect) return;
        const { sessionId } = effect;

        switch (effect.type) {
          case "mode":
            setSessionStates((prev) => ({
              ...prev,
              [sessionId]: applyModeEffect(prev[sessionId], effect.modeId),
            }));
            return;
          case "config":
            setSessionStates((prev) => ({
              ...prev,
              [sessionId]: applyConfigEffect(prev[sessionId], effect.configOptions),
            }));
            return;
          case "usage":
            setContextReports((prev) => {
              const next = applyUsageEffect(prev[sessionId], effect.size, effect.used);
              return next ? { ...prev, [sessionId]: next } : prev;
            });
            return;
          case "user-chunk":
            // 历史回放会带用户消息；实时 prompt 的用户气泡已本地插入，忽略回声。
            if (!runningRef.current) appendUserChunk(sessionId, effect.text);
            return;
          case "agent-chunk": {
            // /context 是本地命令，输出只用于解析，不写进对话
            const silent = silentContextRef.current;
            if (silent && silent.sessionId === sessionId) {
              silent.text += effect.text;
              return;
            }
            appendBlock(sessionId, { type: "text", text: effect.text });
            return;
          }
          case "thought-chunk":
            appendBlock(sessionId, { type: "thinking", text: effect.text });
            return;
          case "tool-call": {
            const tool = effect.tool;
            appendBlock(sessionId, {
              type: "tool_call",
              text: tool.toolCallId,
              toolName: tool.toolName,
              title: tool.title,
              kind: tool.kind,
              rawInput: tool.rawInput,
              result: tool.result,
              diffs: tool.diffs.length ? tool.diffs : undefined,
              locations: tool.locations.length ? tool.locations : undefined,
              status: "pending",
              raw: tool.raw,
            });
            // 只记录实时执行的动作：session/load 会回放历史工具调用，不能被当成新事件
            if (runningRef.current) {
              const label = `${tool.toolName} ${tool.kind}`;
              void logAudit({
                category: /bash|shell|exec|terminal/i.test(label)
                  ? "命令安全"
                  : /read|write|edit|fs|grep|glob/i.test(label)
                    ? "文件安全"
                    : /fetch|http|web|browser/i.test(label)
                      ? "网络访问"
                      : "模型行为",
                action: `调用工具 ${tool.toolName}`,
                detail: tool.title || tool.rawInput.slice(0, 200),
                level: "info",
              });
            }
            return;
          }
          case "tool-update":
            updateToolCall(sessionId, effect.toolCallId, {
              status: effect.status,
              result: effect.result,
              title: effect.title,
              diffs: effect.diffs,
              locations: effect.locations,
            });
            return;
        }
        return;
      }

      const params = event.params as Record<string, unknown>;
      if (event.method === "session/request_permission") {
        const ask = routePermissionRequest(params);
        setPermission({ ...ask, respond: event.respond });
        void logAudit({
          category: "权限审批",
          action: "请求确认工具操作",
          detail: ask.title,
          level: "warn",
        });
        return;
      }

      // 工具类 RPC 由主进程执行，这里只做转交
      const runTool = async (task: Promise<{ ok: boolean; result?: unknown; error?: string }>) => {
        try {
          const result = await task;
          if (result.ok) event.respond(result.result ?? {});
          else event.respondError(-32000, result.error || "工具执行失败");
        } catch (error) {
          event.respondError(-32000, (error as Error).message);
        }
      };
      const runner = resolveToolRpc(event.method, window.desktop.acpTools);
      if (runner)
        void runTool(runner(params) as Promise<{ ok: boolean; result?: unknown; error?: string }>);
      else event.respond({});
    },
    [appendBlock, appendUserChunk, logAudit, runningRef, updateToolCall],
  );

  // 事件处理器放 ref：epoch 重连时不该因为回调引用变化而断链
  const handlerRef = useRef(handleEvent);
  useEffect(() => {
    handlerRef.current = handleEvent;
  }, [handleEvent]);

  useEffect(() => {
    const bridge = window.desktop;
    if (!bridge) {
      setStatus("错误：preload 未注入");
      return;
    }

    bridge.settings.get().then((loaded) => setSettings(loaded));
    bridge.onStderr((text) => setStderrLog((prev) => [...prev.slice(-80), text]));
    bridge.onExit(() => {
      setConnected(false);
      setRunning(false);
      setStatus("omp 已退出");
    });

    const acp = new AcpClient(bridge);
    acp.onEvent((event) => handlerRef.current(event));
    clientRef.current = acp;
    setClient(acp);
    // 进程重启后会话需要重新 load，历史也要重新回放
    loadedSessions.current.clear();

    (async () => {
      const started = await acp.start();
      if (!started.ok) {
        setStatus(`启动失败：${started.error}`);
        return;
      }
      setStatus("握手中…");
      try {
        await acp.initialize();
        const loaded = await bridge.settings.get();
        const stored = await bridge.sessions.get();
        hiddenRef.current = stored.filter((session) => session.hidden);
        const index = await loadSessionIndex(acp, loaded, stored);
        const { list } = index;
        if (index.created) {
          const created = index.created;
          loadedSessions.current.add(created.sessionId);
          setSessionStates((prev) => ({
            ...prev,
            [created.sessionId]: normalizeSessionState(created),
          }));
        }

        setSessions(list);
        void persistSessions(list);
        // 切换安全等级会重启进程，优先回到用户原先正在看的会话
        const previous = activeIdRef.current;
        const first = (previous && list.find((item) => item.id === previous)) || list[0];
        setActiveId(first.id);
        setConnected(true);
        setStatus("已连接");
        await loadSessionHistory(acp, first.id, first.cwd || loaded.cwd);
        void probeContext(first.id, acp);
      } catch (error) {
        setStatus(`握手失败：${(error as Error).message}`);
      }
    })();

    return () => acp.stop();
  }, [epoch, loadSessionHistory, persistSessions, probeContext, setRunning, setSettings]);

  /**
   * 把界面上的会话绑到 omp 里新建的 session 上。
   * omp 重启后旧 sessionId 会失效，直接报错会让用户「没法对话」，这里保留标题与本地消息，
   * 只把 id 换掉，后续请求走新 session。
   */
  const rebindSession = useCallback(
    async (acp: AcpClient, oldId: string, cwd: string) => {
      const created = await acp.newSession(cwd);
      const newId = created.sessionId;
      const nextSessions = sessions.map((item) =>
        item.id === oldId ? { ...item, id: newId } : item,
      );
      setSessions(nextSessions);
      void persistSessions(nextSessions);
      setSessionStates((prev) => ({ ...prev, [newId]: normalizeSessionState(created) }));
      setMessagesBySession((prev) => {
        const next = { ...prev };
        next[newId] = next[oldId] ?? [];
        delete next[oldId];
        return next;
      });
      loadedSessions.current.add(newId);
      setActiveId(newId);
      return newId;
    },
    [persistSessions, sessions, setMessagesBySession],
  );

  const selectSession = useCallback(
    async (session: Session) => {
      setActiveId(session.id);
      setRunning(false);
      if (client && !loadedSessions.current.has(session.id)) {
        const loaded = await window.desktop.settings.get();
        await loadSessionHistory(client, session.id, session.cwd || loaded.cwd);
        void probeContext(session.id, client);
      }
    },
    [client, loadSessionHistory, probeContext, setRunning],
  );

  /** 以给定列表为基础新建 omp 会话；删除最后一个会话后也走这里补一个空的 */
  const createSession = useCallback(
    async (base: Session[]) => {
      if (!client) return;
      try {
        const loaded = await window.desktop.settings.get();
        const session = await client.newSession(loaded.cwd);
        const next: Session[] = [
          ...base,
          {
            id: session.sessionId,
            title: `会话 ${base.length + 1}`,
            cwd: loaded.cwd,
            ts: Date.now(),
          },
        ];
        loadedSessions.current.add(session.sessionId);
        setSessionStates((prev) => ({
          ...prev,
          [session.sessionId]: normalizeSessionState(session),
        }));
        setSessions(next);
        void persistSessions(next);
        // 空会话在筛选里算「规划中」，所以显式登记空消息列表
        setMessagesBySession((prev) => ({ ...prev, [session.sessionId]: [] }));
        setActiveId(session.sessionId);
        setRunning(false);
      } catch (error) {
        setStatus(`新建会话失败：${(error as Error).message}`);
      }
    },
    [client, persistSessions, setRunning, setMessagesBySession],
  );

  const newSession = useCallback(() => createSession(sessions), [createSession, sessions]);

  const renameSession = useCallback(
    (id: string, title: string) => {
      const next = sessions.map((session) => (session.id === id ? { ...session, title } : session));
      setSessions(next);
      void persistSessions(next);
    },
    [sessions, persistSessions],
  );

  const togglePin = useCallback(
    (id: string) => {
      const next = sessions.map((session) =>
        session.id === id ? { ...session, pinned: !session.pinned } : session,
      );
      setSessions(next);
      void persistSessions(next);
    },
    [sessions, persistSessions],
  );

  const deleteSession = useCallback(
    async (session: Session) => {
      const next = sessions.filter((item) => item.id !== session.id);
      // 记录 hidden：否则下次 session/list 会把它当成「omp 里有、本地没有」重新加回来
      hiddenRef.current = [
        ...hiddenRef.current.filter((item) => item.id !== session.id),
        {
          id: session.id,
          title: session.title,
          cwd: session.cwd || "",
          ts: session.ts,
          hidden: true,
        },
      ];
      setSessions(next);
      void persistSessions(next);
      setMessagesBySession((prev) => {
        const copy = { ...prev };
        delete copy[session.id];
        return copy;
      });
      if (activeIdRef.current !== session.id) return;
      const fallback = next[0];
      if (fallback) {
        await selectSession(fallback);
      } else if (client) {
        await createSession([]);
      } else {
        setActiveId(null);
        setRunning(false);
      }
    },
    [
      client,
      createSession,
      persistSessions,
      selectSession,
      sessions,
      setMessagesBySession,
      setRunning,
    ],
  );

  /** 切换安全等级：omp 只接受启动参数，因此要重启 ACP 进程并恢复当前会话 */
  const changeApprovalMode = useCallback(
    async (mode: ApprovalMode) => {
      const current = settingsRef.current;
      if (!current) return;
      if (mode === current.approvalMode) return;
      if (runningRef.current) {
        setStatus("任务运行中，结束后再切换安全等级");
        return;
      }
      setSettings((prev) => ({ ...prev, approvalMode: mode }));
      try {
        await window.desktop.settings.set({ approvalMode: mode });
      } catch (error) {
        setStatus(`安全等级保存失败：${(error as Error).message}`);
        return;
      }
      setStatus(`安全等级已切换为「${APPROVAL_LABEL[mode]}」，正在重连 omp…`);
      setConnected(false);
      setEpoch((value) => value + 1);
    },
    [runningRef, settingsRef, setSettings],
  );

  return {
    client,
    clientRef,
    connected,
    status,
    setStatus,
    stderrLog,
    sessions,
    setSessions,
    activeId,
    setActiveId,
    activeIdRef,
    sessionStates,
    setSessionStates,
    contextReports,
    setContextReports,
    permission,
    setPermission,
    pendingPermissionRef,
    contextBusyRef,
    probeContext,
    loadSessionHistory,
    rebindSession,
    selectSession,
    newSession,
    renameSession,
    togglePin,
    deleteSession,
    changeApprovalMode,
  };
}
