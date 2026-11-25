/**
 * 自定义模型：直接读写 omp 自己的 `~/.omp/agent/models.yml`。
 * 用 yaml 的 Document API 改文件，保留用户手写的注释与其它字段，
 * 不做「整文件重写」这种会毁掉配置的操作。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseDocument } from "yaml";

export interface CustomModelEntry {
	provider: string;
	id: string;
	name: string;
	baseUrl: string;
	api: string;
	apiKey: string;
	contextWindow?: number;
	maxTokens?: number;
	supportsTools: boolean;
	reasoning: boolean;
	vision: boolean;
}

export interface CustomModelState {
	path: string;
	models: CustomModelEntry[];
	/** omp modelRoles：default / smol / slow / plan */
	roles: Record<string, string>;
}

export interface ModelInput {
	provider: string;
	id: string;
	name: string;
	baseUrl: string;
	api?: string;
	apiKey?: string;
	contextWindow?: number;
	maxTokens?: number;
	supportsTools?: boolean;
	reasoning?: boolean;
	vision?: boolean;
	/** 兼容旧 provider 的 apiKey：留空表示沿用已有值 */
	keepKey?: boolean;
}

const MODELS_PATH = join(homedir(), ".omp", "agent", "models.yml");
const DEFAULT_API = "openai-completions";
const PROVIDER_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function modelsPath() {
	return MODELS_PATH;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readDocument() {
	if (!existsSync(MODELS_PATH)) return parseDocument("");
	const text = readFileSync(MODELS_PATH, "utf8");
	return parseDocument(text);
}

function toEntries(provider: string, raw: Record<string, unknown>): CustomModelEntry[] {
	const models = Array.isArray(raw.models) ? raw.models : [];
	return models.map((item) => {
		const model = asRecord(item);
		const input = Array.isArray(model.input) ? model.input : [];
		return {
			provider,
			id: String(model.id ?? ""),
			name: String(model.name ?? model.id ?? ""),
			baseUrl: String(raw.baseUrl ?? ""),
			api: String(raw.api ?? DEFAULT_API),
			apiKey: String(raw.apiKey ?? ""),
			contextWindow: typeof model.contextWindow === "number" ? model.contextWindow : undefined,
			maxTokens: typeof model.maxTokens === "number" ? model.maxTokens : undefined,
			supportsTools: model.supportsTools !== false,
			reasoning: model.reasoning === true,
			vision: input.includes("image"),
		};
	});
}

export function listCustomModels(): CustomModelState {
	const doc = readDocument();
	const providers = asRecord(doc.toJS() as unknown);
	const rawProviders = asRecord(providers.providers);
	const models: CustomModelEntry[] = [];
	for (const [provider, value] of Object.entries(rawProviders)) {
		models.push(...toEntries(provider, asRecord(value)));
	}
	return {
		path: MODELS_PATH,
		models,
		roles: Object.fromEntries(
			Object.entries(asRecord(providers.modelRoles)).map(([key, value]) => [key, String(value)]),
		),
	};
}

/** 校验并写入一条模型；同 provider + id 视为编辑。 */
export function saveCustomModel(input: ModelInput): CustomModelState {
	const provider = input.provider.trim();
	const id = input.id.trim();
	if (!PROVIDER_RE.test(provider)) {
		throw new Error("供应商标识只能用小写字母、数字、- 或 _，例如 my-gateway");
	}
	if (!id) throw new Error("模型 ID 不能为空");
	const baseUrl = input.baseUrl.trim();
	if (!/^https?:\/\//.test(baseUrl)) throw new Error("接口地址必须以 http:// 或 https:// 开头");

	mkdirSync(dirname(MODELS_PATH), { recursive: true });
	const doc = readDocument();
	const existingProvider = doc.getIn(["providers", provider]);
	if (!existingProvider) doc.setIn(["providers", provider], {});

	doc.setIn(["providers", provider, "baseUrl"], baseUrl);
	doc.setIn(["providers", provider, "api"], input.api?.trim() || DEFAULT_API);
	const apiKey = input.apiKey?.trim() ?? "";
	if (apiKey) doc.setIn(["providers", provider, "apiKey"], apiKey);

	// 用 toJS 拿纯对象再改，避开 yaml 节点类型的泛型差异；改完整组写回
	const docValue = asRecord(doc.toJS() as unknown);
	const providerValue = asRecord(asRecord(docValue.providers)[provider]);
	const list = (Array.isArray(providerValue.models) ? providerValue.models : []).map(asRecord);
	const index = list.findIndex((item) => String(item.id ?? "") === id);

	const next: Record<string, unknown> = {
		id,
		name: input.name.trim() || id,
		supportsTools: input.supportsTools !== false,
		reasoning: input.reasoning === true,
		input: input.vision ? ["text", "image"] : ["text"],
	};
	const previous = index >= 0 ? list[index] : {};
	if (input.contextWindow && input.contextWindow > 0) next.contextWindow = input.contextWindow;
	else if (typeof previous.contextWindow === "number") next.contextWindow = previous.contextWindow;
	if (input.maxTokens && input.maxTokens > 0) next.maxTokens = input.maxTokens;
	else if (typeof previous.maxTokens === "number") next.maxTokens = previous.maxTokens;
	// thinking 配置无法在界面上完整表达，编辑时保留原值，避免改个名字就丢能力
	if (previous.thinking) next.thinking = previous.thinking;

	const nextList =
		index >= 0 ? list.map((item, i) => (i === index ? next : item)) : [...list, next];
	doc.setIn(["providers", provider, "models"], nextList);

	writeFileSync(MODELS_PATH, doc.toString(), "utf8");
	return listCustomModels();
}

export function deleteCustomModel(provider: string, id: string): CustomModelState {
	if (!existsSync(MODELS_PATH)) return listCustomModels();
	const doc = readDocument();
	const docValue = asRecord(doc.toJS() as unknown);
	const providerValue = asRecord(asRecord(docValue.providers)[provider]);
	const list = (Array.isArray(providerValue.models) ? providerValue.models : []).map(asRecord);
	const rest = list.filter((item) => String(item.id ?? "") !== id);
	if (rest.length === list.length) return listCustomModels();
	if (rest.length === 0) doc.deleteIn(["providers", provider]);
	else doc.setIn(["providers", provider, "models"], rest);
	writeFileSync(MODELS_PATH, doc.toString(), "utf8");
	return listCustomModels();
}

export interface ConnectionProbe {
	ok: boolean;
	status?: number;
	message: string;
}

/**
 * 连接测试只发一次最小 chat/completions 请求。
 * 网关常见的两种路径都试：<base>/chat/completions 与 <base>/v1/chat/completions。
 */
export async function testModelConnection(input: {
	baseUrl: string;
	apiKey: string;
	model: string;
}): Promise<ConnectionProbe> {
	const base = input.baseUrl.trim().replace(/\/+$/, "");
	if (!/^https?:\/\//.test(base)) return { ok: false, message: "接口地址无效" };
	const targets = [`${base}/chat/completions`];
	if (!/\/v\d+$/.test(base)) targets.push(`${base}/v1/chat/completions`);

	let last: ConnectionProbe = { ok: false, message: "未发出请求" };
	for (const url of targets) {
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 20_000);
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${input.apiKey.trim()}`,
				},
				body: JSON.stringify({
					model: input.model,
					messages: [{ role: "user", content: "ping" }],
					max_tokens: 8,
					stream: false,
				}),
				signal: controller.signal,
			});
			clearTimeout(timer);
			if (response.ok) return { ok: true, status: response.status, message: "连接成功" };
			const text = (await response.text()).slice(0, 300);
			last = { ok: false, status: response.status, message: `HTTP ${response.status} ${text}` };
			if (response.status !== 404) return last;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			last = { ok: false, message: message.includes("abort") ? "连接超时" : message };
		}
	}
	return last;
}
