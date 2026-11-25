import type { NavGroup } from "./types";

/**
 * 导航顺序必须与 `panes/` 在设置主体里的渲染顺序一致，
 * 否则滚动联动会按 id 找到错位的分区。
 */
export const NAV: NavGroup[] = [
  {
    title: "设置",
    items: [
      { id: "general", label: "通用", desc: "启动、电源与网络行为", icon: "gear" },
      { id: "appearance", label: "外观", desc: "主题与字号", icon: "palette" },
      { id: "storage", label: "存储", desc: "缓存与工作空间路径", icon: "folder" },
    ],
  },
  {
    title: "功能",
    items: [
      { id: "personal", label: "个性化", desc: "称呼、风格与长期指令", icon: "user" },
      { id: "memory", label: "记忆与进化", desc: "本地记忆、技能进化与工作背景", icon: "spark" },
      { id: "models", label: "模型", desc: "自定义模型与辅助任务模型", icon: "chip" },
    ],
  },
  {
    title: "数据与安全",
    items: [
      { id: "security", label: "安全中心", desc: "审批、沙箱、数据保护与审计", icon: "shield" },
    ],
  },
  {
    title: "高级",
    items: [{ id: "advanced", label: "高级", desc: "omp 与 bun 的可执行路径", icon: "code" }],
  },
];

export function navTo(id: string) {
  document.getElementById(`omp-settings-${id}`)?.scrollIntoView({ block: "start" });
}
