/**
 * 发送前的敏感信息体检。只做本地正则匹配，不外发任何内容；
 * 命中后由用户决定是否仍然发送，避免把密钥贴进对话。
 */

const SENSITIVE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "私钥文件内容", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "GitHub Token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { label: "云厂商 AccessKey", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "API Key", re: /\b(?:sk|pk|ak)-[A-Za-z0-9_-]{16,}\b/ },
  {
    label: "口令 / 密钥字段",
    re: /(api[_-]?key|secret[_-]?key|access[_-]?token|password|passwd|pwd)\s*[:=：]\s*\S{8,}/i,
  },
];

/** 返回命中的规则名，未命中返回 null */
export function detectSensitive(text: string): string | null {
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.re.test(text)) return pattern.label;
  }
  return null;
}
