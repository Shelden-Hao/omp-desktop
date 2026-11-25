import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** omp 内置提供者实际读取的四个 MCP 配置文件位置（见 discovery/builtin.ts）。 */
export interface McpServerInfo {
	name: string;
	scope: "user" | "project";
	source: string;
	enabled: boolean;
	transport: string;
}

export interface McpConfigInfo {
	servers: McpServerInfo[];
	paths: Array<{ scope: "user" | "project"; path: string; exists: boolean }>;
}

function readConfig(path: string): Record<string, unknown> {
	if (!existsSync(path)) return {};
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const root = parsed as Record<string, unknown>;
			const servers = root.mcpServers;
			return servers && typeof servers === "object" && !Array.isArray(servers)
				? (servers as Record<string, unknown>)
				: {};
		}
	} catch {
		// 配置损坏时按空处理，菜单里仍能显示文件路径供用户自行修复
	}
	return {};
}

function describeServer(value: unknown): { enabled: boolean; transport: string } {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return { enabled: true, transport: "未知" };
	}
	const config = value as Record<string, unknown>;
	return {
		enabled: config.enabled !== false,
		transport:
			typeof config.url === "string"
				? "HTTP"
				: typeof config.command === "string"
					? "stdio"
					: "未知",
	};
}

/** 只读汇总 omp 的 MCP 连接器配置，不修改任何文件。 */
export function listMcpServers(cwd: string): McpConfigInfo {
	const candidates = [
		{ scope: "user" as const, path: join(homedir(), ".omp", "agent", "mcp.json") },
		{ scope: "user" as const, path: join(homedir(), ".omp", "agent", ".mcp.json") },
		{ scope: "project" as const, path: join(cwd, ".omp", "mcp.json") },
		{ scope: "project" as const, path: join(cwd, ".omp", ".mcp.json") },
	];
	const servers: McpServerInfo[] = [];
	for (const candidate of candidates) {
		const config = readConfig(candidate.path);
		for (const [name, value] of Object.entries(config)) {
			const info = describeServer(value);
			servers.push({ name, scope: candidate.scope, source: candidate.path, ...info });
		}
	}
	return {
		servers,
		paths: candidates.map((item) => ({ ...item, exists: existsSync(item.path) })),
	};
}
