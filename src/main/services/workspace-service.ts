/**
 * 工作区文件：预览读取、ACP 的 fs/read_text_file 与 fs/write_text_file 回调。
 * 所有路径都要落在当前工作目录内，越界一律拒绝。
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { OpenedFile, ToolResult } from "../../shared/types";
import { getSettings } from "./settings-service";
import { sessionCwd } from "./session-service";

const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
	js: "javascript",
	jsx: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	ts: "typescript",
	tsx: "typescript",
	json: "json",
	jsonc: "json",
	md: "markdown",
	mdx: "markdown",
	css: "css",
	scss: "css",
	less: "css",
	html: "html",
	htm: "html",
	vue: "vue",
	py: "python",
	rb: "ruby",
	go: "go",
	rs: "rust",
	java: "java",
	kt: "kotlin",
	c: "c",
	h: "c",
	cpp: "cpp",
	hpp: "cpp",
	cs: "csharp",
	php: "php",
	sh: "shell",
	bash: "shell",
	ps1: "powershell",
	yml: "yaml",
	yaml: "yaml",
	toml: "toml",
	ini: "ini",
	sql: "sql",
	env: "text",
	txt: "text",
};

export function languageFor(fileName: string) {
	const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() || "" : "";
	return LANGUAGE_BY_EXTENSION[ext] || "text";
}

/** 目标路径是否在 root 之内（Windows 大小写不敏感，统一转小写比较） */
function isInside(target: string, root: string) {
	const targetKey = target.toLowerCase();
	const rootKey = root.toLowerCase();
	return targetKey === rootKey || targetKey.startsWith(`${rootKey}${sep.toLowerCase()}`);
}

/**
 * 校验路径落在工作目录内。root 默认取设置里的默认目录；
 * 会话有自己的 cwd 时由调用方传入（见 sessionCwd），否则跨项目会话的读写会被误拒。
 */
export function resolveWorkspacePath(input: string, root = getSettings().cwd): string {
	const base = resolve(root);
	const target = resolve(isAbsolute(input) ? input : join(base, input));
	if (!isInside(target, base)) throw new Error("路径超出工作目录");
	return target;
}

/** 符号链接可能指向工作目录之外，解析真实路径后再校验一次 */
function resolveExistingPath(input: string, root: string): string {
	const candidate = resolveWorkspacePath(input, root);
	if (!existsSync(candidate)) return candidate;
	try {
		const real = resolve(realpathSync(candidate));
		if (!isInside(real, resolve(root))) throw new Error("路径超出工作目录");
		return real;
	} catch (error) {
		if (error instanceof Error && error.message === "路径超出工作目录") throw error;
		return candidate;
	}
}

export function readTextDocument(filePath: string): OpenedFile {
	const stat = statSync(filePath);
	if (!stat.isFile()) throw new Error("路径不是文件");
	if (stat.size > MAX_PREVIEW_BYTES) throw new Error("文件超过 2 MB，未载入预览");

	const buffer = readFileSync(filePath);
	if (buffer.includes(0)) throw new Error("文件包含二进制内容，未载入预览");

	return {
		path: filePath,
		name: basename(filePath),
		content: buffer.toString("utf8"),
		language: languageFor(filePath),
	};
}

function toolOk(result: unknown = {}): ToolResult {
	return { ok: true, result };
}

function toolFail(error: unknown): ToolResult {
	return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export function acpFsRead(params: Record<string, unknown>): ToolResult {
	try {
		if (typeof params.path !== "string" || !params.path) throw new Error("缺少文件路径");
		const root = sessionCwd(params.sessionId) || getSettings().cwd;
		const filePath = resolveExistingPath(params.path, root);
		const document = readTextDocument(filePath);
		const line = typeof params.line === "number" && params.line > 0 ? params.line : 1;
		const limit = typeof params.limit === "number" && params.limit > 0 ? params.limit : undefined;
		let content = document.content;
		if (line > 1 || limit !== undefined) {
			const lines = content.split(/\r?\n/);
			content = lines.slice(line - 1, limit ? line - 1 + limit : undefined).join("\n");
		}
		return toolOk({ content });
	} catch (error) {
		return toolFail(error);
	}
}

export function acpFsWrite(params: Record<string, unknown>): ToolResult {
	try {
		if (typeof params.path !== "string" || !params.path) throw new Error("缺少文件路径");
		if (typeof params.content !== "string") throw new Error("文件内容必须是文本");
		const root = sessionCwd(params.sessionId) || getSettings().cwd;
		const filePath = resolveWorkspacePath(params.path, root);
		const contentBytes = Buffer.byteLength(params.content, "utf8");
		if (contentBytes > MAX_PREVIEW_BYTES) throw new Error("单次写入超过 2 MB");
		mkdirSync(dirname(filePath), { recursive: true });
		writeFileSync(filePath, params.content, "utf8");
		return toolOk();
	} catch (error) {
		return toolFail(error);
	}
}
