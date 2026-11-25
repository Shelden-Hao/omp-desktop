import type { CustomModelEntry } from "../../../shared/types";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

/** 连接测试直接打模型服务商的最小请求，失败原因原样回显 */
export function probeModel(model: CustomModelEntry, apiKey: string) {
  return window.desktop.models.test({ baseUrl: model.baseUrl, apiKey, model: model.id });
}

/** 去掉 IPC 抛错时 Electron 加的前缀，界面上只显示真实原因 */
export function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, "");
}
