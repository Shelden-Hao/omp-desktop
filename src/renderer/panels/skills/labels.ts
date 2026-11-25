/** 技能面板的文案词典与纯格式化函数（不含 React） */
import type { SkillScope, SkillSearchData } from "../../../shared/types";
import type { MarketHit, SkillSort } from "./types";

export const SORT_LABEL: Record<SkillSort, string> = {
  relevance: "综合",
  downloads: "下载量",
  recent: "最新",
};

export const SCOPE_LABEL: Record<SkillScope, string> = {
  user: "用户级（全局）",
  project: "项目级",
};

export function scopeOf(source: string): SkillScope {
  return source.endsWith(":project") ? "project" : "user";
}

export function initials(name: string): string {
  return name.replace(/^@/, "").slice(0, 2).toUpperCase();
}

export function shortNumber(value?: number): string {
  if (value === undefined) return "—";
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function isTrustedHit(hit: MarketHit): boolean {
  // omp 市场没有独立的“已安全扫描”字段：只认官方 scope 或官方标记的关键词，
  // 其余技能一律保留人工确认，避免把普通第三方包当成可信包静默安装。
  const trustedMarkers = new Set(["omp", "official", "verified", "trusted"]);
  return (
    trustedMarkers.has(hit.scope.toLowerCase()) ||
    hit.keywords.some((keyword) => trustedMarkers.has(keyword.toLowerCase()))
  );
}

export function toHits(data: SkillSearchData | undefined): MarketHit[] {
  return (data?.hits ?? []).map((hit) => {
    const scope = hit.scope ?? "";
    const name = hit.name ?? "未命名技能";
    return {
      scope,
      name,
      fullName: scope ? `@${scope}/${name}` : name,
      description: typeof hit.description === "string" ? hit.description : "",
      weeklyDownloads: hit.weeklyDownloads,
      updatedAt: hit.updatedAt,
      keywords: Array.isArray(hit.keywords)
        ? hit.keywords.filter((keyword): keyword is string => typeof keyword === "string")
        : [],
    };
  });
}

export function detailText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => detailText(item)).join(", ");
  return "";
}
