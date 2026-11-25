/** 技能面板的展示类型。数据形状来自 shared/types 的 omp 返回，这里是界面侧的归一化 */
import type { SkillScope, SkillSummary } from "../../../shared/types";

export type SkillTab = "installed" | "market";
export type SkillSort = "relevance" | "downloads" | "recent";
export type ScopeFilter = "all" | SkillScope;

/** 市场搜索结果，字段经短名与关键词归一化，供可信判断与展示使用 */
export interface MarketHit {
  scope: string;
  name: string;
  fullName: string;
  description: string;
  weeklyDownloads?: number;
  updatedAt?: number | string;
  keywords: string[];
}

export type SkillSelection =
  | { kind: "installed"; skill: SkillSummary; enabled: boolean }
  | { kind: "market"; hit: MarketHit }
  | null;

export interface SkillsPanelProps {
  cwd: string;
  autoInstallTrustedSkills: boolean;
  onClose(): void;
  onUseSkill(name: string): void;
}
