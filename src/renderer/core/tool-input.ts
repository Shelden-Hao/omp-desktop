/**
 * ACP 内容的取值与展示：把工具调用的 content 归一成文本，
 * 以及把 rawInput 序列化成可读 JSON。
 */

export function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join("");
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (obj.content !== undefined) return extractText(obj.content);
  }
  return "";
}

export function formatToolInput(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "string") return raw;
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}
