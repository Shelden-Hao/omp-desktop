/**
 * 本地会话索引：sessions.json 只存 id/标题/工作目录/时间，
 * 真正的对话内容由 omp 自己保存，这里不重复造一份 transcript。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { StoredSession } from "../../shared/types";

export const SESSIONS_PATH = join(app.getPath("userData"), "sessions.json");

export function loadSessions(): StoredSession[] {
	try {
		if (!existsSync(SESSIONS_PATH)) return [];
		const parsed: unknown = JSON.parse(readFileSync(SESSIONS_PATH, "utf8"));
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(
				(item): item is StoredSession =>
					Boolean(item) &&
					typeof item === "object" &&
					typeof item.id === "string" &&
					typeof item.title === "string" &&
					typeof item.cwd === "string",
			)
			.map((item) => ({ id: item.id, title: item.title, cwd: item.cwd, ts: item.ts }));
	} catch {
		return [];
	}
}

export function saveSessions(next: StoredSession[]) {
	mkdirSync(dirname(SESSIONS_PATH), { recursive: true });
	writeFileSync(SESSIONS_PATH, JSON.stringify(next, null, 2), "utf8");
}
