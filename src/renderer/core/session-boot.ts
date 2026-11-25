/**
 * 启动时的会话索引装配：本地索引 + omp session/list 合并，一个都没有时新建。
 * 抽成纯异步函数，连接 hook 里只剩「调用 + 落 state」。
 */

import type { DesktopSettings, StoredSession } from "../../shared/types";
import type { Session } from "./session-filters";

type SessionLister = {
  listSessions(): Promise<{ sessions: Array<{ sessionId: string; title?: string; cwd?: string }> }>;
  newSession(cwd: string): Promise<{ sessionId: string } & Record<string, unknown>>;
};

export interface SessionIndex {
  list: Session[];
  /** 无历史时新建的会话（用于登记能力态），没有则为 null */
  created: ({ sessionId: string } & Record<string, unknown>) | null;
}

export async function loadSessionIndex(
  acp: SessionLister,
  settings: DesktopSettings,
  stored: StoredSession[],
): Promise<SessionIndex> {
  // hidden 是本地「已移除」标记：既不进列表，也要挡住 session/list 重新加回来
  const hidden = new Set(stored.filter((session) => session.hidden).map((session) => session.id));
  const list: Session[] = stored
    .filter((session) => !session.hidden)
    .map((session) => ({
      id: session.id,
      title: session.title,
      cwd: session.cwd || settings.cwd,
      ts: session.ts,
      pinned: session.pinned,
    }));

  try {
    const remote = await acp.listSessions();
    for (const session of remote.sessions || []) {
      if (hidden.has(session.sessionId)) continue;
      if (!list.some((item) => item.id === session.sessionId)) {
        list.push({
          id: session.sessionId,
          title: session.title || `会话 ${list.length + 1}`,
          cwd: session.cwd || settings.cwd,
          ts: Date.now(),
        });
      }
    }
  } catch {
    // 某些 omp 版本没有 session/list，忽略即可。
  }

  if (list.length === 0) {
    const session = await acp.newSession(settings.cwd);
    return {
      list: [{ id: session.sessionId, title: "会话 1", cwd: settings.cwd, ts: Date.now() }],
      created: session,
    };
  }
  return { list, created: null };
}
