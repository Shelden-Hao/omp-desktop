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
  /**
   * 清理后的归档标记（hidden 字段沿用旧 key）：omp 侧已不存在的 id 会被丢弃，避免只增不减。
   * listSessions 失败时原样返回（无法确定哪些 id 失效，不能误清导致已归档会话复活）。
   */
  hidden: StoredSession[];
}

export async function loadSessionIndex(
  acp: SessionLister,
  settings: DesktopSettings,
  stored: StoredSession[],
): Promise<SessionIndex> {
  // hidden 是本地「已归档」标记（字段名沿用旧 key 兼容 sessions.json）：既不进列表，也挡住 session/list 重新加回来
  // （omp 的 session/close 只是标记 closed_at，仍可能出现在 session/list 里，必须靠 hidden 挡住）
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

  let hiddenStored = stored.filter((session) => session.hidden);
  try {
    const remote = await acp.listSessions();
    const remoteIds = new Set((remote.sessions || []).map((session) => session.sessionId));
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
    // omp 侧已不存在的隐藏 id 没有意义：清掉，避免本地 hidden 列表只增不减。
    hiddenStored = hiddenStored.filter((session) => remoteIds.has(session.id));
  } catch {
    // 某些 omp 版本没有 session/list，忽略即可；此时无法判断失效 id，保持 hidden 原样。
  }

  if (list.length === 0) {
    const session = await acp.newSession(settings.cwd);
    return {
      list: [{ id: session.sessionId, title: "会话 1", cwd: settings.cwd, ts: Date.now() }],
      created: session,
      hidden: hiddenStored,
    };
  }
  return { list, created: null, hidden: hiddenStored };
}
