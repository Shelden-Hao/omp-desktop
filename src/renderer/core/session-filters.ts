/**
 * 会话列表的本地视图模型与筛选条件。
 * omp 不返回任务状态，这里的状态由本地会话数据推导，仅用于界面筛选。
 */
import type { ChatMessage } from "../../shared/types";

export interface Session {
  id: string;
  title: string;
  cwd?: string;
  ts?: number;
  /** 置顶会话排在列表最前，纯本地偏好 */
  pinned?: boolean;
}

export type SidebarView = "recent" | "grouped";

export type StatusFilter = "all" | "running" | "done" | "failed" | "pending" | "planned";
export type TimeFilter = "all" | "today" | "week" | "month";

export const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "running", label: "进行中" },
  { value: "done", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "pending", label: "待处理" },
  { value: "planned", label: "规划中" },
];

export const TIME_FILTERS: Array<{ value: TimeFilter; label: string }> = [
  { value: "all", label: "全部时间" },
  { value: "today", label: "今天" },
  { value: "week", label: "最近 7 天" },
  { value: "month", label: "最近 30 天" },
];

export interface SessionFilterInput {
  sessions: Session[];
  messagesBySession: Record<string, ChatMessage[]>;
  statusFilter: StatusFilter;
  timeFilter: TimeFilter;
  running: boolean;
  activeId: string | null;
  now?: number;
}

/** 按状态与时间筛选会话：状态来自本地消息的最后一条，没有本地缓存的会话按已完成处理 */
export function filterSessions({
  sessions,
  messagesBySession,
  statusFilter,
  timeFilter,
  running,
  activeId,
  now = Date.now(),
}: SessionFilterInput): Session[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const matchTime = (ts?: number) => {
    if (timeFilter === "all") return true;
    if (!ts) return false;
    if (timeFilter === "today") return ts >= startOfToday.getTime();
    if (timeFilter === "week") return ts >= now - 7 * 86_400_000;
    return ts >= now - 30 * 86_400_000;
  };

  const statusOf = (session: Session): StatusFilter => {
    if (running && session.id === activeId) return "running";
    const list = messagesBySession[session.id];
    // 未打开过的历史会话没有本地缓存，按已完成处理
    if (!list) return "done";
    if (!list.length) return "planned";
    const last = list[list.length - 1];
    if (last.role === "system") return "failed";
    if (last.role === "user") return "pending";
    return "done";
  };

  const matched = sessions.filter(
    (session) =>
      matchTime(session.ts) && (statusFilter === "all" || statusOf(session) === statusFilter),
  );
  // 置顶在前，其余按最近活动排序；toSorted 稳定，时间相同保持原顺序
  return matched.toSorted((left, right) => {
    const pin = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned));
    return pin !== 0 ? pin : (right.ts ?? 0) - (left.ts ?? 0);
  });
}
