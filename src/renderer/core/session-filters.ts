/**
 * 会话列表的本地视图模型与筛选条件。
 * omp 不返回任务状态，这里的状态由本地会话数据推导，仅用于界面筛选。
 */

export interface Session {
  id: string;
  title: string;
  cwd?: string;
  ts?: number;
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
