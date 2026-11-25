import type {
  ApprovalMode,
  LinkOpenMode,
  PolicyTool,
  ProxyMode,
  ReplyStyle,
  ThemeMode,
  ToolPolicy,
} from "../../../shared/types";

export const LINK_LABEL: Record<LinkOpenMode, string> = {
  ask: "智能打开（先询问）",
  browser: "系统浏览器",
  copy: "仅复制链接",
};

export const PROXY_LABEL: Record<ProxyMode, string> = {
  direct: "直接连接",
  system: "使用系统代理",
  manual: "手动代理",
};

export const THEME_LABEL: Record<ThemeMode, string> = {
  light: "浅色",
  dark: "深色",
  system: "跟随系统",
};

export const REPLY_STYLE_LABEL: Record<ReplyStyle, string> = {
  default: "默认",
  friendly: "更亲切",
  pragmatic: "更务实",
  none: "关闭人格设定",
};

export const APPROVAL_LABEL: Record<ApprovalMode, string> = {
  "always-ask": "每次操作都确认",
  "always-ask-cached": "确认并记住授权",
  write: "写入前确认",
  yolo: "全部自动批准",
};

export const POLICY_LABEL: Record<ToolPolicy | "follow", string> = {
  follow: "跟随审批档位",
  allow: "直接允许",
  prompt: "每次询问",
  deny: "禁止执行",
};

export const POLICY_TOOL_LABEL: Record<PolicyTool, string> = {
  bash: "命令执行（bash）",
  write: "写入文件（write）",
  edit: "修改文件（edit）",
  read: "读取文件（read）",
};
