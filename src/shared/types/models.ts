/**
 * 模型领域类型：自定义模型直接映射 omp `~/.omp/agent/models.yml`，
 * 辅助任务角色映射 `modelRoles.*`，容量信息来自同一份文件。
 */

export interface CustomModelEntry {
  provider: string;
  id: string;
  name: string;
  baseUrl: string;
  api: string;
  apiKey: string;
  contextWindow?: number;
  maxTokens?: number;
  supportsTools: boolean;
  reasoning: boolean;
  vision: boolean;
}

export interface CustomModelState {
  path: string;
  models: CustomModelEntry[];
  roles: Record<string, string>;
}

export interface ModelInputData {
  provider: string;
  id: string;
  name: string;
  baseUrl: string;
  api?: string;
  apiKey?: string;
  contextWindow?: number;
  maxTokens?: number;
  supportsTools?: boolean;
  reasoning?: boolean;
  vision?: boolean;
}

/** omp models.yml 里的模型容量信息，用于模型面板展示上下文窗口 */
export interface ModelContextInfo {
  value: string;
  contextWindow?: number;
  maxTokens?: number;
}

/** omp config.yml 中本应用会读写的键 */
export interface OmpConfigData {
  memoryBackend: string;
  memoriesEnabled: boolean;
  autoLearn: boolean;
  personality: string;
  approvalMode: string;
  approval: Record<string, string>;
  restrictedFolders: string[];
  modelRoles: Record<string, string>;
  configPath: string;
}

/** 内置运行时探测结果，只读展示 */
export interface RuntimeInfo {
  id: string;
  name: string;
  version: string;
  path: string;
  available: boolean;
  note: string;
}
