/**
 * ACP (Agent Client Protocol) 客户端。
 * 直接基于 JSON-RPC 2.0 over NDJSON，不依赖 SDK 的具体版本 API，
 * 这样 omp 升级导致 SDK 变更时外壳不受影响。
 */

import type { DesktopBridge } from "../../../shared/bridge";
import type { AcpEvent } from "../../../shared/protocol";
import type { SessionConfigOption, SessionModeState, SessionState } from "../../../shared/types";

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
  timeoutMs: number;
};

/**
 * 分级超时：握手/会话管理类快速失败；prompt 允许长任务，但收到 session/update
 * 说明 agent 仍在干活时会续期，连续 5 分钟无任何帧才判定僵死。
 */
const REQUEST_TIMEOUT: Record<string, number> = {
  initialize: 10_000,
  "session/new": 15_000,
  "session/load": 15_000,
  "session/list": 15_000,
  "session/set_mode": 15_000,
  "session/set_config_option": 15_000,
  "session/prompt": 5 * 60_000,
};
const DEFAULT_TIMEOUT = 15_000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** 把 ACP 原始 configOptions/modes 规范化，兼容不同 omp 版本的字段差异 */
export function normalizeSessionState(raw: unknown): SessionState {
  const source = asRecord(raw);
  const rawModes = source.modes;
  let modes: SessionModeState | null = null;
  if (rawModes && typeof rawModes === "object") {
    const m = rawModes as Record<string, unknown>;
    const available = Array.isArray(m.availableModes)
      ? m.availableModes
          .map((item) => {
            const mode = asRecord(item);
            return {
              id: String(mode.id || ""),
              name: String(mode.name || mode.id || ""),
              description: typeof mode.description === "string" ? mode.description : null,
            };
          })
          .filter((mode) => mode.id)
      : [];
    modes = { currentModeId: String(m.currentModeId || ""), availableModes: available };
  }
  const configOptions = (Array.isArray(source.configOptions) ? source.configOptions : [])
    .map((item): SessionConfigOption | null => {
      const option = asRecord(item);
      const id = String(option.id || "");
      if (!id) return null;
      const type = option.type === "boolean" ? "boolean" : "select";
      const select = asRecord(option);
      const options = Array.isArray(select.options)
        ? select.options
            .map((entry) => {
              const value = asRecord(entry);
              const grouped = Array.isArray(value.options) ? value.options : [];
              const flatten = grouped.length
                ? grouped.map((g) => {
                    const group = asRecord(g);
                    return {
                      value: String(group.value || ""),
                      name: String(group.name || group.value || ""),
                      description: typeof group.description === "string" ? group.description : null,
                    };
                  })
                : [
                    {
                      value: String(value.value || ""),
                      name: String(value.name || value.value || ""),
                      description: typeof value.description === "string" ? value.description : null,
                    },
                  ];
              return flatten;
            })
            .flat()
            .filter((entry) => entry.value)
        : [];
      return {
        id,
        name: String(option.name || id),
        description: typeof option.description === "string" ? option.description : null,
        category: typeof option.category === "string" ? option.category : null,
        type,
        currentValue:
          typeof option.currentValue === "string" ? option.currentValue : options[0]?.value,
        currentBoolean:
          typeof option.currentValue === "boolean"
            ? option.currentValue
            : typeof option.currentBoolean === "boolean"
              ? option.currentBoolean
              : undefined,
        options,
      };
    })
    .filter((option): option is SessionConfigOption => Boolean(option));
  return { modes, configOptions };
}

export class AcpClient {
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private offFrame: () => void = () => {};
  private listeners = new Set<(e: AcpEvent) => void>();

  constructor(private bridge: DesktopBridge) {}

  /** 启动 omp 并注册帧监听 */
  async start(): Promise<{ ok: boolean; error?: string }> {
    const r = await this.bridge.agent.start();
    if (!r.ok) return r;
    this.offFrame = this.bridge.onFrame((line) => this.handleFrame(line));
    return r;
  }

  stop() {
    this.offFrame();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("agent stopped"));
    }
    this.pending.clear();
    this.bridge.agent.stop();
  }

  /** 超时后从 pending 清除并 reject，调用方（use-agent-prompt 等）已有 catch/finally 复位 UI */
  private expire(id: number, method: string) {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    p.reject(new Error(`${method} 请求超时：omp 无响应`));
  }

  /** 收到 agent 帧时给 prompt 续期：长任务可以跑很久，但不能永久卡住 UI */
  private refreshPromptTimeout() {
    for (const [id, p] of this.pending) {
      if (p.method !== "session/prompt") continue;
      clearTimeout(p.timer);
      p.timer = setTimeout(() => this.expire(id, p.method), p.timeoutMs);
    }
  }

  onEvent(cb: (e: AcpEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: AcpEvent) {
    for (const cb of this.listeners) cb(e);
  }

  /** 发请求，等待响应；超时后清理 pending 并 reject，避免 UI 永久运行中 */
  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const timeoutMs = REQUEST_TIMEOUT[method] ?? DEFAULT_TIMEOUT;
    const line = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.expire(id, method), timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method, timeoutMs });
      this.bridge.agent.send(line).then((r) => {
        if (!r.ok) {
          const p = this.pending.get(id);
          if (!p) return;
          this.pending.delete(id);
          clearTimeout(p.timer);
          reject(new Error(r.error || "send failed"));
        }
      });
    });
  }

  /** 发通知（无响应） */
  notify(method: string, params: unknown) {
    this.bridge.agent.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  /** 响应 agent 发来的请求（权限、fs、terminal） */
  private respond(id: number, result: unknown, error?: { code: number; message: string }) {
    const payload: Record<string, unknown> = { jsonrpc: "2.0", id };
    if (error) payload.error = error;
    else payload.result = result;
    this.bridge.agent.send(JSON.stringify(payload));
  }

  private handleFrame(line: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    // 收到任何帧都说明 omp 还活着，给在途 prompt 续期（长任务不该被固定超时误杀）
    this.refreshPromptTimeout();

    if (typeof msg.id === "number" && ("result" in msg || "error" in msg)) {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
      return;
    }

    if (typeof msg.id === "number" && "method" in msg) {
      this.handleServerRequest(msg.id as number, msg.method as string, msg.params);
      return;
    }

    if ("method" in msg) {
      this.emit({ type: "notification", method: msg.method as string, params: msg.params });
    }
  }

  private handleServerRequest(id: number, method: string, params: unknown) {
    this.emit({
      type: "server_request",
      method,
      params,
      respond: (result) => this.respond(id, result),
      respondError: (code, message) => this.respond(id, undefined, { code, message }),
    });
  }

  // ---- 对外 ACP 方法 ----

  async initialize() {
    return this.request("initialize", {
      protocolVersion: 1,
      clientInfo: { name: "omp-desktop", version: "0.1.0" },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
    });
  }

  async newSession(cwd: string) {
    const raw = await this.request("session/new", { cwd, mcpServers: [] });
    return { ...asRecord(raw), sessionId: String(asRecord(raw).sessionId || "") } as {
      sessionId: string;
    } & Record<string, unknown>;
  }

  async loadSession(sessionId: string, cwd: string) {
    return this.request("session/load", { sessionId, cwd, mcpServers: [] });
  }

  async setMode(sessionId: string, modeId: string) {
    return this.request("session/set_mode", { sessionId, modeId });
  }

  async setConfigOption(sessionId: string, configId: string, value: string | boolean) {
    const payload = typeof value === "boolean" ? { type: "boolean", value } : { value };
    return this.request("session/set_config_option", { sessionId, configId, ...payload });
  }

  async listSessions() {
    return this.request("session/list", {}) as Promise<{
      sessions: Array<{ sessionId: string; title?: string; cwd?: string }>;
    }>;
  }

  async prompt(sessionId: string, text: string) {
    return this.request("session/prompt", {
      sessionId,
      prompt: [{ type: "text", text }],
    });
  }

  /**
   * 关闭会话：ACP 标准方法，omp 侧标记 closed_at（不删除 jsonl 文件）。
   * 外壳没有直接删 omp 私有文件的权限，归档会话按钮走这里。
   */
  async closeSession(sessionId: string) {
    return this.request("session/close", { sessionId });
  }

  cancel(sessionId: string) {
    this.notify("session/cancel", { sessionId });
  }
}

/**
 * omp 进程重启后旧 sessionId 会失效，ACP 用 -32002 `Resource not found` 表示。
 * 外壳据此把会话透明地绑到新 session 上，而不是把协议错误直接甩给用户。
 */
export function isStaleSessionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /resource not found/i.test(message) || message.includes("-32002");
}
