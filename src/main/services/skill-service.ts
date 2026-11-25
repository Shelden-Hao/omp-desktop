/**
 * 技能管理宿主：全部命令委托给本机 omp CLI，外壳不实现自己的技能逻辑。
 * omp 真实支持的接口见 `omp skill --help`；这里只用 --json 输出。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import type {
	SkillCommandReply,
	SkillCreateInput,
	SkillPathsData,
	SkillUpdateSummary,
} from "../../shared/types";
import { proxyEnv } from "../platform/system";

export interface SkillHostSettings {
	bunPath: string;
	ompCliPath: string;
	cwd: string;
	proxyMode?: "direct" | "system" | "manual";
	proxyUrl?: string;
}

export type SkillCommandResult = SkillCommandReply;
export type SkillPaths = SkillPathsData;

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const COMMAND_TIMEOUT_MS = 60_000;

export interface SkillCallReply<T> {
	ok: boolean;
	data?: T;
	error?: string;
}

/** 统一包装 IPC 返回值，避免跨进程异常只剩字符串。 */
export async function skillCall<T>(fn: () => Promise<T>): Promise<SkillCallReply<T>> {
	try {
		return { ok: true, data: await fn() };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export function skillCommand(fn: () => Promise<SkillCommandResult>): Promise<SkillCommandResult> {
	return skillCall(fn).then((reply) =>
		reply.ok && reply.data
			? reply.data
			: { ok: false, stdout: "", stderr: "", error: reply.error ?? "命令失败" },
	);
}

function fail(error: string): SkillCommandResult {
	return { ok: false, stdout: "", stderr: "", error };
}

/** 以数组参数启动 bun <omp-cli>，不做任何 shell 拼接。 */
export function runOmpCommand(
	settings: SkillHostSettings,
	args: string[],
	cwd = settings.cwd,
): Promise<SkillCommandResult> {
	if (!existsSync(settings.bunPath))
		return Promise.resolve(fail(`找不到 bun：${settings.bunPath}`));
	if (!existsSync(settings.ompCliPath))
		return Promise.resolve(fail(`找不到 omp CLI：${settings.ompCliPath}`));

	return new Promise((done) => {
		const env = proxyEnv(settings.proxyMode ?? "direct", settings.proxyUrl ?? "");
		let child;
		try {
			child = spawn(settings.bunPath, [settings.ompCliPath, ...args], {
				cwd,
				env,
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			});
		} catch (error) {
			done(fail(`启动 omp 失败：${error instanceof Error ? error.message : String(error)}`));
			return;
		}

		let stdout = "";
		let stderr = "";
		let settled = false;
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});

		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill();
			done({ ok: false, stdout, stderr, error: "omp 命令超时" });
		}, COMMAND_TIMEOUT_MS);

		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			done({ ok: false, stdout, stderr, error: error.message });
		});
		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (code !== 0) {
				done({
					ok: false,
					stdout,
					stderr,
					error: stderr.trim() || `omp 命令退出码 ${code ?? 0}`,
				});
				return;
			}
			done({ ok: true, stdout, stderr });
		});
	});
}

/** 解析 omp --json 输出；失败时抛出带上下文的错误。 */
function parseJson(stdout: string): unknown {
	try {
		return JSON.parse(stdout) as unknown;
	} catch {
		throw new Error(`无法解析 omp 输出：${stdout.slice(0, 200)}`);
	}
}

/** `omp skill list [dir] --json`：列出指定目录会解析到的全部技能。 */
export async function listSkills(settings: SkillHostSettings, cwd: string): Promise<unknown> {
	const result = await runOmpCommand(settings, ["skill", "list", cwd, "--json"]);
	if (!result.ok) throw new Error(result.error ?? "列出技能失败");
	return parseJson(result.stdout);
}

/** `omp skill search <query> --sort <sort> --json`。 */
export async function searchSkills(
	settings: SkillHostSettings,
	query: string,
	sort: "relevance" | "downloads" | "recent",
): Promise<unknown> {
	if (!query.trim()) throw new Error("搜索内容不能为空");
	const result = await runOmpCommand(settings, [
		"skill",
		"search",
		query,
		"--sort",
		sort,
		"--json",
	]);
	if (!result.ok) throw new Error(result.error ?? "搜索技能失败");
	return parseJson(result.stdout);
}

/** `omp skill info <@scope/name> --json`：市场包详情。 */
export async function showSkillInfo(settings: SkillHostSettings, spec: string): Promise<unknown> {
	if (!spec.startsWith("@")) throw new Error("技能包标识格式应为 @scope/name");
	const result = await runOmpCommand(settings, ["skill", "info", spec, "--json"]);
	if (!result.ok) throw new Error(result.error ?? "获取技能详情失败");
	return parseJson(result.stdout);
}

/** `omp skill install <spec> [-g] --yes`：安装到当前工作目录或用户目录。 */
export async function installSkill(
	settings: SkillHostSettings,
	spec: string,
	scope: "user" | "project",
): Promise<SkillCommandResult> {
	if (!spec.startsWith("@")) throw new Error("技能包标识格式应为 @scope/name");
	const args = ["skill", "install", spec, "--yes"];
	if (scope === "user") args.push("-g");
	return runOmpCommand(settings, args);
}

/** `omp skill publish [dir] [--scope s]`：把本地目录发布到 Skillshare。 */
export function publishSkill(
	settings: SkillHostSettings,
	dir: string,
	scope: string,
): Promise<SkillCommandResult> {
	if (!dir.trim()) throw new Error("请选择技能目录");
	if (!scope.trim()) throw new Error("请输入发布者 scope");
	return runOmpCommand(settings, ["skill", "publish", dir, "--scope", scope]);
}

/** `omp skill uninstall <name...> [-g]`。 */
export function uninstallSkill(
	settings: SkillHostSettings,
	name: string,
	scope: "user" | "project",
): Promise<SkillCommandResult> {
	if (!name) throw new Error("技能名称不能为空");
	const args = ["skill", "uninstall", name];
	if (scope === "user") args.push("-g");
	return runOmpCommand(settings, args);
}

/** 读取 omp 配置项（原值，来自 config get --json）。 */
export async function getSkillConfigValue(
	settings: SkillHostSettings,
	key: string,
): Promise<unknown> {
	const result = await runOmpCommand(settings, ["config", "get", key, "--json"]);
	if (!result.ok) throw new Error(result.error ?? `读取 ${key} 失败`);
	const body = parseJson(result.stdout) as { value?: unknown };
	return body.value;
}

/** 写入 omp 配置项（数组以 JSON 字符串传入，符合 omp config set 的解析规则）。 */
async function setSkillConfigValue(
	settings: SkillHostSettings,
	key: string,
	value: unknown,
): Promise<void> {
	const result = await runOmpCommand(settings, [
		"config",
		"set",
		key,
		JSON.stringify(value),
		"--json",
	]);
	if (!result.ok) throw new Error(result.error ?? `写入 ${key} 失败`);
}

function asNameList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

/**
 * 启停通过 omp 原生的 skills.ignoredSkills 实现：只增删目标技能名，
 * 保留用户已有的其它忽略项与 glob 规则。
 */
export async function setSkillEnabled(
	settings: SkillHostSettings,
	name: string,
	enabled: boolean,
): Promise<void> {
	if (!name) throw new Error("技能名称不能为空");
	const current = asNameList(await getSkillConfigValue(settings, "skills.ignoredSkills"));
	const next = enabled ? current.filter((item) => item !== name) : [...new Set([...current, name])];
	await setSkillConfigValue(settings, "skills.ignoredSkills", next);
}

/** 从 omp 自己的 config path 推导技能目录，跟随 profile / OMP_CONFIG_DIR。 */
export async function getSkillPaths(settings: SkillHostSettings): Promise<SkillPaths> {
	const result = await runOmpCommand(settings, ["config", "path"]);
	if (!result.ok) {
		return {
			userDir: join(homedir(), ".omp", "agent", "skills"),
			projectDir: join(resolve(settings.cwd), ".omp", "skills"),
		};
	}
	const agentDir = result.stdout.trim() || join(homedir(), ".omp", "agent");
	return {
		userDir: join(agentDir, "skills"),
		projectDir: join(resolve(settings.cwd), ".omp", "skills"),
	};
}

/** 创建本地技能：只写 omp 能发现的 SKILL.md，并在工作目录边界内校验。 */
export async function createSkill(
	settings: SkillHostSettings,
	input: SkillCreateInput,
): Promise<{ path: string }> {
	if (!NAME_RE.test(input.name)) {
		throw new Error("技能名只能用小写字母、数字、连字符和下划线，且以字母或数字开头");
	}
	const description = input.description.trim();
	if (!description) throw new Error("技能描述不能为空");
	const paths = await getSkillPaths(settings);
	const root = input.scope === "user" ? paths.userDir : paths.projectDir;
	const target = resolve(root, input.name);
	if (target !== root && !target.startsWith(`${root}${sep}`))
		throw new Error("技能目录超出允许范围");
	const file = join(target, "SKILL.md");
	if (existsSync(file)) throw new Error("同名技能已存在");
	mkdirSync(target, { recursive: true });
	const body = `---\nname: ${input.name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${input.name}\n\n在这里写技能内容与操作步骤。\n`;
	writeFileSync(file, body, "utf8");
	return { path: file };
}

/**
 * 更新 skills.json 中登记过的注册表技能（skills.omp.sh）。
 * 只调用 `omp skill update -g`：本地手写/agents 目录里的技能没有注册表版本，
 * 逐个传名字会全部报 "Invalid skill name / not listed"。
 */
export async function updateAllInstalledSkills(
	host: SkillHostSettings,
): Promise<SkillUpdateSummary> {
	const summary: SkillUpdateSummary = { updated: 0, failed: 0, errors: [] };
	const result = await skillCommand(() => runOmpCommand(host, ["skill", "update", "-g", "--yes"]));
	if (!result.ok) {
		summary.failed = 1;
		summary.errors.push(result.error ?? "更新技能失败");
		return summary;
	}
	// 每更新一个技能输出一行：+ @scope/name@1.2.3 或 @scope/name 1.0 → 1.2.3
	summary.updated = result.stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.startsWith("+ ") || line.includes("→")).length;
	return summary;
}
