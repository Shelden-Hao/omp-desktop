/**
 * IPC 契约：preload 暴露到 window.desktop 的完整能力面。
 * 主进程按域实现通道，渲染层只依赖这个接口，不关心通道名。
 */

import type {
  AuditEntry,
  CustomModelState,
  DesktopSettings,
  McpConfigInfo,
  ModelContextInfo,
  ModelInputData,
  OmpConfigData,
  OpenedFile,
  RuntimeInfo,
  SettingsSaveResult,
  SkillCommandReply,
  SkillCreateInput,
  SkillListData,
  SkillPathsData,
  SkillScope,
  SkillSearchData,
  SkillUpdateSummary,
  SkillsReply,
  StoredSession,
  SystemInfoData,
  ToolResult,
} from "./types";

export interface DesktopBridge {
  agent: {
    start(): Promise<{ ok: boolean; error?: string }>;
    stop(): Promise<{ ok: boolean }>;
    status(): Promise<{ running: boolean }>;
    send(line: string): Promise<{ ok: boolean; error?: string }>;
  };
  skills: {
    list(cwd?: string): Promise<SkillsReply<SkillListData>>;
    search(
      query: string,
      sort: "relevance" | "downloads" | "recent",
    ): Promise<SkillsReply<SkillSearchData>>;
    info(spec: string): Promise<SkillsReply<Record<string, unknown>>>;
    install(spec: string, scope: SkillScope): Promise<SkillCommandReply>;
    uninstall(name: string, scope: SkillScope): Promise<SkillCommandReply>;
    publish(dir: string, scope: string): Promise<SkillCommandReply>;
    config(key: string): Promise<SkillsReply<unknown>>;
    enabled(name: string, enabled: boolean): Promise<SkillsReply<void>>;
    paths(): Promise<SkillsReply<SkillPathsData>>;
    create(input: SkillCreateInput): Promise<SkillsReply<{ path: string }>>;
    updateAll(): Promise<SkillUpdateSummary>;
  };
  system: {
    info(): Promise<SystemInfoData>;
    openPath(path: string): Promise<{ ok: boolean; error?: string }>;
    pickDirectory(): Promise<string | null>;
    runtimes(): Promise<RuntimeInfo[]>;
  };
  links: {
    open(url: string): Promise<void>;
  };
  window: {
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    close(): Promise<void>;
  };
  settings: {
    get(): Promise<DesktopSettings>;
    /** ompSyncError 表示本地已保存、但写 omp config.yml 失败的原因 */
    set(next: Partial<DesktopSettings>): Promise<SettingsSaveResult>;
  };
  sessions: {
    get(): Promise<StoredSession[]>;
    set(next: StoredSession[]): Promise<StoredSession[]>;
  };
  models: {
    context(): Promise<ModelContextInfo[]>;
    list(): Promise<CustomModelState>;
    save(input: ModelInputData): Promise<CustomModelState>;
    remove(provider: string, id: string): Promise<CustomModelState>;
    test(input: { baseUrl: string; apiKey: string; model: string }): Promise<{
      ok: boolean;
      status?: number;
      message: string;
    }>;
    setRole(role: string, value: string): Promise<{ ok: boolean; error?: string }>;
  };
  omp: {
    config(): Promise<OmpConfigData>;
    setConfig(entries: Array<[string, string]>): Promise<{ ok: boolean; error?: string }>;
  };
  audit: {
    list(): Promise<AuditEntry[]>;
    add(entry: Partial<AuditEntry>): Promise<AuditEntry>;
    clear(): Promise<{ ok: boolean }>;
    export(): Promise<{ ok: boolean; path?: string; error?: string }>;
  };
  files: {
    open(): Promise<OpenedFile | null>;
    read(path: string): Promise<OpenedFile>;
  };
  mcp: {
    list(): Promise<McpConfigInfo>;
  };
  acpTools: {
    fsRead(params: Record<string, unknown>): Promise<ToolResult>;
    fsWrite(params: Record<string, unknown>): Promise<ToolResult>;
    terminalCreate(params: Record<string, unknown>): Promise<ToolResult>;
    terminalOutput(params: Record<string, unknown>): Promise<ToolResult>;
    terminalWait(params: Record<string, unknown>): Promise<ToolResult>;
    terminalKill(params: Record<string, unknown>): Promise<ToolResult>;
    terminalRelease(params: Record<string, unknown>): Promise<ToolResult>;
  };
  onFrame(cb: (line: string) => void): () => void;
  onStderr(cb: (text: string) => void): () => void;
  onExit(cb: (code: string) => void): () => void;
}

declare global {
  interface Window {
    desktop: DesktopBridge;
  }
}
