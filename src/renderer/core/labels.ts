/**
 * ACP 取值到中文的展示词典。取值来自 omp，未知值原样显示，不臆造选项。
 */

import type { ApprovalMode } from "../../shared/types";

/** 思考强度档位的展示文案 */
export const THINKING_LABEL: Record<string, string> = {
  off: "关闭",
  none: "关闭",
  auto: "自动",
  minimal: "极低",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "很高",
  max: "最大",
};

export const MODE_LABEL: Record<string, string> = {
  default: "默认",
  plan: "规划",
  accept_edits: "自动编辑",
  read_only: "只读",
};

export const APPROVAL_LABEL: Record<ApprovalMode, string> = {
  yolo: "完全允许",
  write: "仅写入确认",
  "always-ask-cached": "询问并记住",
  "always-ask": "每次询问",
};

export const APPROVAL_HINT: Record<ApprovalMode, string> = {
  yolo: "所有工具调用直接执行，不再确认",
  write: "读取自动通过，写文件与执行命令前确认",
  "always-ask-cached": "文件读取也需要确认，确认后可记住该路径",
  "always-ask": "仅只读工具自动通过，其它每次都要确认",
};

export const APPROVAL_OPTIONS: ApprovalMode[] = [
  "yolo",
  "write",
  "always-ask-cached",
  "always-ask",
];

/** 工具类别 → 中文动作名 */
export const TOOL_KIND_LABEL: Record<string, string> = {
  read: "读取文件",
  edit: "编辑文件",
  delete: "删除文件",
  move: "移动文件",
  search: "搜索",
  execute: "运行命令",
  think: "思考",
  fetch: "获取内容",
  switch_mode: "切换模式",
  other: "工具调用",
};
