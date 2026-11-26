/**
 * 本地会话索引：sessions.json 存会话列表（数组）与工作区分组元数据（workspaces 字段），
 * 真正的对话内容由 omp 自己保存，这里不重复造一份 transcript。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { StoredSession, StoredWorkspace } from "../../shared/types";

export const SESSIONS_PATH = join(app.getPath("userData"), "sessions.json");
interface SessionIndex {
	sessions?: StoredSession[];
	workspaces: StoredWorkspace[];
}

function asWorkspace(item: unknown): StoredWorkspace | null {
	if (!item || typeof item !== "object" || !("cwd" in item)) return null;
	const cwd = item.cwd;
	if (typeof cwd !== "string" || !cwd) return null;
	const name = "name" in item ? item.name : undefined;
	const pinned = "pinned" in item ? item.pinned : undefined;
	return {
		cwd,
		...(typeof name === "string" && name ? { name } : {}),
		...(pinned === true ? { pinned: true } : {}),
	};
}

/** 读整个索引文件；老格式（纯数组）按无工作区元数据处理 */
function readIndex(): SessionIndex {
	try {
		if (!existsSync(SESSIONS_PATH)) return { workspaces: [] };
		const parsed: unknown = JSON.parse(readFileSync(SESSIONS_PATH, "utf8"));
		if (Array.isArray(parsed) || !parsed || typeof parsed !== "object") {
			return { workspaces: [] };
		}
		if (!("workspaces" in parsed)) return { workspaces: [] };
		const raw = parsed.workspaces;
		if (!Array.isArray(raw)) return { workspaces: [] };
		return {
			workspaces: raw.map(asWorkspace).filter((item): item is StoredWorkspace => item !== null),
		};
	} catch {
		return { workspaces: [] };
	}
}

function writeIndex(index: SessionIndex) {
	mkdirSync(dirname(SESSIONS_PATH), { recursive: true });
	writeFileSync(SESSIONS_PATH, JSON.stringify(index, null, 2), "utf8");
}

export function loadSessions(): StoredSession[] {
	try {
		if (!existsSync(SESSIONS_PATH)) return [];
		const parsed: unknown = JSON.parse(readFileSync(SESSIONS_PATH, "utf8"));
		// 老格式是纯数组；新格式 sessions 存在对象里
		const raw: unknown[] = Array.isArray(parsed) ? parsed : (readIndex().sessions ?? []);
		if (!Array.isArray(raw)) return [];
		return raw
			.filter((item): item is StoredSession => {
				if (!item || typeof item !== "object") return false;
				return (
					"id" in item &&
					"title" in item &&
					"cwd" in item &&
					typeof item.id === "string" &&
					typeof item.title === "string" &&
					typeof item.cwd === "string"
				);
			})
			.map((item) => ({
				id: item.id,
				title: item.title,
				cwd: item.cwd,
				ts: item.ts,
				...(item.pinned === true ? { pinned: true } : {}),
				...(item.hidden === true ? { hidden: true } : {}),
			}));
	} catch {
		return [];
	}
}

export function saveSessions(next: StoredSession[]) {
	// 保存会话时保留 workspaces 元数据，避免互相覆盖
	writeIndex({ ...readIndex(), sessions: next });
}

export function loadWorkspaces(): StoredWorkspace[] {
	return readIndex().workspaces;
}

export function saveWorkspaces(next: StoredWorkspace[]) {
	writeIndex({ ...readIndex(), workspaces: next });
}

/**
 * 会话自己的工作目录：ACP 的 fs/terminal 回调按它做沙箱，
 * 找不到（例如老索引没有该会话）时调用方回退到默认目录。
 */
export function sessionCwd(id: unknown): string | null {
	if (typeof id !== "string" || !id) return null;
	return loadSessions().find((session) => session.id === id)?.cwd || null;
}
