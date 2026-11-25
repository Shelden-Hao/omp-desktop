import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ModelContextInfo } from "../../shared/types";

/**
 * omp 的 ACP configOptions 只返回模型名，不返回上下文窗口。
 * 这里读 omp 自己的 models.yml 补上这块信息。
 * 只做最小解析（providers 下每个 model 的 id/contextWindow），不额外引入 YAML 依赖；
 * 解析不到就返回空数组，界面自动隐藏上下文窗口那一行。
 */
export function readModelContexts(): ModelContextInfo[] {
	const path = join(homedir(), ".omp", "agent", "models.yml");
	if (!existsSync(path)) return [];

	let text = "";
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return [];
	}

	const result: ModelContextInfo[] = [];
	let provider = "";
	let current: ModelContextInfo | null = null;

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.replace(/#.*$/, "");
		if (!line.trim()) continue;

		const providerMatch = /^ {2}([A-Za-z0-9_.-]+):\s*$/.exec(line);
		if (providerMatch) {
			provider = providerMatch[1];
			current = null;
			continue;
		}

		const idMatch = /^\s*-\s+id:\s*(\S+)\s*$/.exec(line);
		if (idMatch && provider) {
			current = { value: `${provider}/${idMatch[1]}` };
			result.push(current);
			continue;
		}

		if (!current) continue;

		const contextMatch = /^\s+contextWindow:\s*(\d+)\s*$/.exec(line);
		if (contextMatch) {
			current.contextWindow = Number(contextMatch[1]);
			continue;
		}

		const maxTokensMatch = /^\s+maxTokens:\s*(\d+)\s*$/.exec(line);
		if (maxTokensMatch) current.maxTokens = Number(maxTokensMatch[1]);
	}

	return result;
}
