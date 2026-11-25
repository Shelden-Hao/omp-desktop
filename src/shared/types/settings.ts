/**
 * 应用设置的契约：主进程持久化、渲染层表单、omp 配置同步共用同一份字段定义。
 * 只放类型，不放默认值与校验（那是 main/services/settings-service 的职责）。
 */

export type ThemeMode = "light" | "dark" | "system";

/**
 * omp 的工具审批档位，对应 `tools.approvalMode` / `--approval-mode`：
 * - always-ask 只自动批准只读工具，其它都要确认
 * - always-ask-cached 连文件读取也要确认，确认后可记住该文件/目录
 * - write 自动批准读取与工作区写入，其它仍需确认
 * - yolo 全部自动批准
 */
export type ApprovalMode = "always-ask" | "always-ask-cached" | "write" | "yolo";

export type LinkOpenMode = "ask" | "browser" | "copy";
export type ProxyMode = "direct" | "system" | "manual";
/** 个性化回复风格，直接映射 omp 的 personality */
export type ReplyStyle = "default" | "friendly" | "pragmatic" | "none";
/** 记忆后端，映射 omp 的 memory.backend */
export type MemoryMode = "off" | "local";
export type ToolPolicy = "allow" | "prompt" | "deny";

/** 安全中心实际可控的几类动作，与 omp `tools.approval` 的内置工具名一致 */
export const POLICY_TOOLS = ["bash", "write", "edit", "read"] as const;
export type PolicyTool = (typeof POLICY_TOOLS)[number];

export interface DesktopSettings {
  ompCliPath: string;
  bunPath: string;
  cwd: string;
  theme: ThemeMode;
  /** 透传给 omp 的 --approval-mode，切换后需要重启 ACP 子进程才生效 */
  approvalMode: ApprovalMode;
  /** 字体缩放，1 为默认；通过 --font-scale 影响所有字号变量 */
  fontScale: number;
  linkOpenMode: LinkOpenMode;
  keepAwakeOnLock: boolean;
  preventSystemSleep: boolean;
  openAtLogin: boolean;
  proxyMode: ProxyMode;
  proxyUrl: string;
  autoInstallTrustedSkills: boolean;
  autoUpdateSkills: boolean;
  /** 个性化：omp 对你的称呼 */
  userNickname: string;
  /** 个性化：助手名字 */
  assistantName: string;
  /** 个性化：回复风格 */
  replyStyle: ReplyStyle;
  /** 个性化：长期指令，注入系统提示 */
  customInstructions: string;
  /** 个性化：首页任务推荐 */
  homeSuggestions: boolean;
  /** 记忆与进化 */
  memoryMode: MemoryMode;
  autoLearnSkills: boolean;
  /** 工作背景，注入系统提示 */
  workBackground: string;
  /** 安全中心 */
  sensitiveGuard: boolean;
  restrictedFolders: string[];
  toolPolicies: Partial<Record<PolicyTool, ToolPolicy>>;
  auditEnabled: boolean;
}

/** 保存设置的返回：本地已落盘，但同步 omp 配置失败时带上原因 */
export interface SettingsSaveResult extends DesktopSettings {
  ompSyncError?: string;
}
