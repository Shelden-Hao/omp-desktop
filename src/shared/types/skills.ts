/**
 * 技能领域类型：全部对应 omp `skill` 子命令的 --json 输出，
 * 外壳不定义自己的技能模型，避免两套状态。
 */

export type SkillScope = "user" | "project";

export interface SkillsReply<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface SkillSummary {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
  hide: boolean;
}

export interface SkillListData {
  skills: SkillSummary[];
  warnings: Array<{ message: string }>;
}

export interface SkillSearchData {
  total: number;
  page: number;
  perPage: number;
  hits: Array<{
    scope?: string;
    name?: string;
    description?: string;
    weeklyDownloads?: number;
    updatedAt?: number | string;
    keywords?: string[];
    [key: string]: unknown;
  }>;
}

export interface SkillPathsData {
  userDir: string;
  projectDir: string;
}

export interface SkillCommandReply {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface SkillUpdateSummary {
  updated: number;
  failed: number;
  errors: string[];
}

export interface SkillCreateInput {
  name: string;
  description: string;
  scope: SkillScope;
}
