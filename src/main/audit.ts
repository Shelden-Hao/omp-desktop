/**
 * 审计中心：把客户端真实发生的高风险动作落盘（JSONL，按行追加）。
 * 只记录渲染层上报的真实事件（工具调用、审批请求、敏感拦截），不做推测。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app, dialog } from "electron";

export interface AuditEntry {
	ts: number;
	category: string;
	action: string;
	detail: string;
	level: "info" | "warn" | "block";
}

const AUDIT_PATH = join(app.getPath("userData"), "audit.jsonl");
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ITEMS = 500;

const CATEGORIES = new Set([
	"文件安全",
	"命令安全",
	"网络访问",
	"权限审批",
	"敏感保护",
	"模型行为",
	"审计",
]);

function clip(value: unknown, limit: number): string {
	const text = typeof value === "string" ? value : String(value ?? "");
	return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** ES2022 目标下没有 Array#toReversed，这里手动倒序，避免原地 reverse 改到调用方数组 */
function newestFirst<T>(list: T[]): T[] {
	const out: T[] = [];
	for (let i = list.length - 1; i >= 0; i -= 1) out.push(list[i]);
	return out;
}

export function appendAudit(raw: Partial<AuditEntry>): AuditEntry {
	const entry: AuditEntry = {
		ts: typeof raw.ts === "number" && raw.ts > 0 ? raw.ts : Date.now(),
		category: CATEGORIES.has(String(raw.category)) ? String(raw.category) : "审计",
		action: clip(raw.action, 120) || "未知动作",
		detail: clip(raw.detail, 600),
		level: raw.level === "warn" || raw.level === "block" ? raw.level : "info",
	};
	try {
		mkdirSync(dirname(AUDIT_PATH), { recursive: true });
		appendFileSync(AUDIT_PATH, `${JSON.stringify(entry)}\n`, "utf8");
		const size = existsSync(AUDIT_PATH) ? readFileSync(AUDIT_PATH).byteLength : 0;
		if (size > MAX_BYTES) trimAudit();
	} catch (error) {
		console.error("appendAudit failed", error);
	}
	return entry;
}

/** 超过 4MB 时只保留最近 MAX_ITEMS 条，避免审计文件无限膨胀。 */
function trimAudit() {
	try {
		const kept = readAudit(MAX_ITEMS);
		writeFileSync(AUDIT_PATH, kept.map((entry) => `${JSON.stringify(entry)}\n`).join(""), "utf8");
	} catch {
		// 读不出来就保持原文件，不能因为裁剪把审计清空
	}
}

export function readAudit(limit = MAX_ITEMS): AuditEntry[] {
	if (!existsSync(AUDIT_PATH)) return [];
	let text = "";
	try {
		text = readFileSync(AUDIT_PATH, "utf8");
	} catch {
		return [];
	}
	const lines = text.split(/\r?\n/).filter(Boolean);
	const entries: AuditEntry[] = [];
	for (const line of lines.slice(-limit)) {
		try {
			const parsed: unknown = JSON.parse(line);
			if (parsed && typeof parsed === "object") entries.push(parsed as AuditEntry);
		} catch {
			// 单行损坏跳过
		}
	}
	return newestFirst(entries);
}

export function clearAudit(): { ok: boolean } {
	try {
		mkdirSync(dirname(AUDIT_PATH), { recursive: true });
		writeFileSync(AUDIT_PATH, "", "utf8");
		return { ok: true };
	} catch {
		return { ok: false };
	}
}

export async function exportAudit(): Promise<{ ok: boolean; path?: string; error?: string }> {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const result = await dialog.showSaveDialog({
		title: "导出审计日志",
		defaultPath: join(app.getPath("downloads"), `omp-audit-${stamp}.log`),
		filters: [{ name: "日志文件", extensions: ["log", "txt"] }],
	});
	if (result.canceled || !result.filePath) return { ok: false, error: "已取消" };
	try {
		const rows = newestFirst(readAudit(MAX_ITEMS));
		const text = rows
			.map(
				(entry) =>
					`${new Date(entry.ts).toLocaleString()} [${entry.category}] ${entry.action}${
						entry.detail ? ` — ${entry.detail}` : ""
					}`,
			)
			.join("\n");
		writeFileSync(result.filePath, text, "utf8");
		return { ok: true, path: result.filePath };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}
