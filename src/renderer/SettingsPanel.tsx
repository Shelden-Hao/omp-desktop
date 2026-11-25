import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
	POLICY_TOOLS,
	type ApprovalMode,
	type AuditEntry,
	type CustomModelEntry,
	type CustomModelState,
	type DesktopSettings,
	type LinkOpenMode,
	type ModelInputData,
	type OmpConfigData,
	type PolicyTool,
	type ProxyMode,
	type ReplyStyle,
	type RuntimeInfo,
	type SystemInfoData,
	type ThemeMode,
	type ToolPolicy,
} from "./acp-client";

interface SettingsPanelProps {
	settings: DesktopSettings;
	onClose(): void;
	onSave(next: DesktopSettings): Promise<void>;
}

interface NavItem {
	id: string;
	label: string;
	desc: string;
	icon: string;
}

interface NavGroup {
	title: string;
	items: NavItem[];
}

const NAV: NavGroup[] = [
	{
		title: "设置",
		items: [
			{ id: "general", label: "通用", desc: "启动、电源与网络行为", icon: "gear" },
			{ id: "appearance", label: "外观", desc: "主题与字号", icon: "palette" },
			{ id: "storage", label: "存储", desc: "缓存与工作空间路径", icon: "folder" },
		],
	},
	{
		title: "功能",
		items: [
			{ id: "personal", label: "个性化", desc: "称呼、风格与长期指令", icon: "user" },
			{ id: "memory", label: "记忆与进化", desc: "本地记忆、技能进化与工作背景", icon: "spark" },
			{ id: "models", label: "模型", desc: "自定义模型与辅助任务模型", icon: "chip" },
		],
	},
	{
		title: "数据与安全",
		items: [
			{ id: "security", label: "安全中心", desc: "审批、沙箱、数据保护与审计", icon: "shield" },
		],
	},
	{
		title: "高级",
		items: [{ id: "advanced", label: "高级", desc: "omp 与 bun 的可执行路径", icon: "code" }],
	},
];

const LINK_LABEL: Record<LinkOpenMode, string> = {
	ask: "智能打开（先询问）",
	browser: "系统浏览器",
	copy: "仅复制链接",
};

const PROXY_LABEL: Record<ProxyMode, string> = {
	direct: "直接连接",
	system: "使用系统代理",
	manual: "手动代理",
};

const THEME_LABEL: Record<ThemeMode, string> = {
	light: "浅色",
	dark: "深色",
	system: "跟随系统",
};

const REPLY_STYLE_LABEL: Record<ReplyStyle, string> = {
	default: "默认",
	friendly: "更亲切",
	pragmatic: "更务实",
	none: "关闭人格设定",
};

const APPROVAL_LABEL: Record<ApprovalMode, string> = {
	"always-ask": "每次操作都确认",
	"always-ask-cached": "确认并记住授权",
	write: "写入前确认",
	yolo: "全部自动批准",
};

const POLICY_LABEL: Record<ToolPolicy | "follow", string> = {
	follow: "跟随审批档位",
	allow: "直接允许",
	prompt: "每次询问",
	deny: "禁止执行",
};

const POLICY_TOOL_LABEL: Record<PolicyTool, string> = {
	bash: "命令执行（bash）",
	write: "写入文件（write）",
	edit: "修改文件（edit）",
	read: "读取文件（read）",
};

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "—";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatTime(ts: number): string {
	return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

/** 连接测试直接打模型服务商的最小请求，失败原因原样回显 */
function probeModel(model: CustomModelEntry, apiKey: string) {
	return window.desktop.models.test({ baseUrl: model.baseUrl, apiKey, model: model.id });
}

/** 去掉 IPC 抛错时 Electron 加的前缀，界面上只显示真实原因 */
function cleanError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, "");
}

function SetIcon({ name, size = 15 }: { name: string; size?: number }) {
	const common = {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.7,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		"aria-hidden": true,
	};
	switch (name) {
		case "search":
			return (
				<svg {...common}>
					<circle cx="11" cy="11" r="7" />
					<path d="m20 20-3.5-3.5" />
				</svg>
			);
		case "gear":
			return (
				<svg {...common}>
					<circle cx="12" cy="12" r="3" />
					<path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" />
				</svg>
			);
		case "palette":
			return (
				<svg {...common}>
					<circle cx="12" cy="12" r="9" />
					<circle cx="9" cy="9" r="1.2" />
					<circle cx="15" cy="9" r="1.2" />
					<circle cx="9.5" cy="14.5" r="1.2" />
				</svg>
			);
		case "folder":
			return (
				<svg {...common}>
					<path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
				</svg>
			);
		case "user":
			return (
				<svg {...common}>
					<circle cx="12" cy="8" r="3.5" />
					<path d="M5 20a7 7 0 0 1 14 0" />
				</svg>
			);
		case "spark":
			return (
				<svg {...common}>
					<path d="M12 3v4m0 10v4M4.5 12h3m9 0h3M6.2 6.2l2.1 2.1m7.4 7.4 2.1 2.1m0-11.6-2.1 2.1M8.3 15.7l-2.1 2.1" />
				</svg>
			);
		case "chip":
			return (
				<svg {...common}>
					<rect x="6" y="6" width="12" height="12" rx="2" />
					<path d="M10 3v3m4-3v3m-4 12v3m4-3v3M3 10h3m-3 4h3m12-4h3m-3 4h3" />
				</svg>
			);
		case "shield":
			return (
				<svg {...common}>
					<path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6Z" />
					<path d="m9 12 2 2 4-4" />
				</svg>
			);
		case "code":
			return (
				<svg {...common}>
					<path d="m9 7-5 5 5 5m6-10 5 5-5 5" />
				</svg>
			);
		case "chevron":
			return (
				<svg {...common}>
					<path d="m9 6 6 6-6 6" />
				</svg>
			);
		case "trash":
			return (
				<svg {...common}>
					<path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" />
				</svg>
			);
		case "pencil":
			return (
				<svg {...common}>
					<path d="M4 20h4l10-10-4-4L4 16Z" />
				</svg>
			);
		case "plug":
			return (
				<svg {...common}>
					<path d="M9 3v6m6-6v6M6 9h12v3a6 6 0 0 1-12 0Z M12 18v3" />
				</svg>
			);
		case "check":
			return (
				<svg {...common}>
					<path d="m5 13 4 4 10-10" />
				</svg>
			);
		default:
			return null;
	}
}

function navTo(id: string) {
	document.getElementById(`omp-settings-${id}`)?.scrollIntoView({ block: "start" });
}

function Row({
	title,
	desc,
	children,
	disabled,
	badge,
}: {
	title: string;
	desc: ReactNode;
	children?: ReactNode;
	disabled?: boolean;
	badge?: string;
}) {
	return (
		<div className={`omp-set-row ${disabled ? "is-disabled" : ""}`}>
			<div className="omp-set-row-text">
				<div className="omp-set-row-title">
					{title}
					{badge && <span className="omp-set-badge">{badge}</span>}
				</div>
				<p className="omp-set-row-desc">{desc}</p>
			</div>
			<div className="omp-set-row-control">{children}</div>
		</div>
	);
}

function Toggle({
	checked,
	onChange,
	label,
	disabled,
}: {
	checked: boolean;
	onChange(next: boolean): void;
	label: string;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			disabled={disabled}
			className={`omp-set-toggle ${checked ? "active" : ""}`}
			onClick={() => onChange(!checked)}
		>
			<span />
		</button>
	);
}

export function SettingsPanel({ settings, onClose, onSave }: SettingsPanelProps) {
	const [draft, setDraft] = useState<DesktopSettings>(settings);
	const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null);
	const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([]);
	const [ompConfig, setOmpConfig] = useState<OmpConfigData | null>(null);
	const [models, setModels] = useState<CustomModelState | null>(null);
	const [audit, setAudit] = useState<AuditEntry[]>([]);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [updating, setUpdating] = useState(false);
	const [activeNav, setActiveNav] = useState("general");
	const [query, setQuery] = useState("");
	const [editor, setEditor] = useState<ModelInputData | null>(null);
	const [saving, setSaving] = useState(false);
	const bodyRef = useRef<HTMLDivElement | null>(null);

	const refreshAudit = useCallback(() => {
		void window.desktop.audit
			.list()
			.then(setAudit)
			.catch(() => setAudit([]));
	}, []);

	useEffect(() => {
		void window.desktop.system
			.info()
			.then(setSystemInfo)
			.catch(() => setSystemInfo(null));
		void window.desktop.system
			.runtimes()
			.then(setRuntimes)
			.catch(() => setRuntimes([]));
		void window.desktop.omp
			.config()
			.then(setOmpConfig)
			.catch(() => setOmpConfig(null));
		void window.desktop.models
			.list()
			.then(setModels)
			.catch(() => setModels(null));
		refreshAudit();
	}, [refreshAudit]);

	const patch = (next: Partial<DesktopSettings>) => setDraft((prev) => ({ ...prev, ...next }));

	const visibleNav = useMemo(() => {
		const keyword = query.trim().toLowerCase();
		if (!keyword) return NAV;
		return NAV.map((group) => ({
			...group,
			items: group.items.filter(
				(item) =>
					item.label.toLowerCase().includes(keyword) || item.desc.toLowerCase().includes(keyword),
			),
		})).filter((group) => group.items.length > 0);
	}, [query]);

	const onScroll = () => {
		const container = bodyRef.current;
		if (!container) return;
		const top = container.getBoundingClientRect().top + 12;
		let current = activeNav;
		for (const group of NAV) {
			for (const item of group.items) {
				const node = document.getElementById(`omp-settings-${item.id}`);
				if (!node) continue;
				if (node.getBoundingClientRect().top <= top) current = item.id;
			}
		}
		if (current !== activeNav) setActiveNav(current);
	};

	const pickWorkspace = async () => {
		setError("");
		const dir = await window.desktop.system.pickDirectory();
		if (dir) patch({ cwd: dir });
	};

	const openCache = async () => {
		setError("");
		if (!systemInfo) return;
		const result = await window.desktop.system.openPath(systemInfo.cacheDir);
		if (!result.ok) setError(result.error ?? "打开缓存目录失败");
	};

	const updateSkillsNow = async () => {
		setError("");
		setNotice("");
		setUpdating(true);
		try {
			const summary = await window.desktop.skills.updateAll();
			if (summary.failed) setNotice(`更新失败：${summary.errors[0] ?? "未知错误"}`);
			else
				setNotice(summary.updated > 0 ? `已更新 ${summary.updated} 个技能` : "注册表技能已是最新");
		} catch (cause) {
			setError(cleanError(cause) || "更新技能失败");
		} finally {
			setUpdating(false);
		}
	};

	const addRestrictedFolder = async () => {
		const dir = await window.desktop.system.pickDirectory();
		if (!dir) return;
		if (draft.restrictedFolders.includes(dir)) return;
		patch({ restrictedFolders: [...draft.restrictedFolders, dir] });
	};

	const save = async () => {
		setError("");
		if (
			draft.proxyMode === "manual" &&
			!/^(https?:\/\/)?[\w.-]+(:\d+)?$/.test(draft.proxyUrl.trim())
		) {
			setError("请填写有效的代理地址，例如 http://127.0.0.1:7890");
			return;
		}
		setSaving(true);
		try {
			await onSave(draft);
			setShowNotice("设置已保存，标注「新建对话生效」的项目需要重启会话");
			void window.desktop.omp
				.config()
				.then(setOmpConfig)
				.catch(() => undefined);
		} catch (cause) {
			setError(cleanError(cause) || "设置保存失败");
		} finally {
			setSaving(false);
		}
	};

	const setShowNotice = (text: string) => {
		setNotice(text);
		window.setTimeout(() => setNotice(""), 4000);
	};

	const refreshModels = async () => {
		try {
			setModels(await window.desktop.models.list());
		} catch (cause) {
			setError(cleanError(cause));
		}
	};

	const saveModel = async (input: ModelInputData) => {
		const state = await window.desktop.models.save(input);
		setModels(state);
		setEditor(null);
		setShowNotice("模型已保存，重启对话后可在模型列表中看到");
	};

	const removeModel = async (model: CustomModelEntry) => {
		try {
			setModels(await window.desktop.models.remove(model.provider, model.id));
			setShowNotice(`已删除 ${model.provider}/${model.id}`);
		} catch (cause) {
			setError(cleanError(cause));
		}
	};

	const setToolPolicy = (tool: PolicyTool, value: ToolPolicy | "follow") => {
		const next = { ...draft.toolPolicies };
		if (value === "follow") delete next[tool];
		else next[tool] = value;
		patch({ toolPolicies: next });
	};

	const usedPercent =
		systemInfo && systemInfo.totalBytes > 0
			? Math.min(100, (systemInfo.usedBytes / systemInfo.totalBytes) * 100)
			: 0;

	const activeItem =
		NAV.flatMap((group) => group.items).find((item) => item.id === activeNav) ?? NAV[0].items[0];

	return (
		<div className="omp-modal-layer" role="dialog" aria-modal="true" aria-label="设置">
			<div className="omp-settings-shell">
				<aside className="omp-settings-nav">
					<label className="omp-set-search">
						<SetIcon name="search" size={13} />
						<input
							value={query}
							placeholder="搜索设置项"
							aria-label="搜索设置项"
							onChange={(event) => setQuery(event.target.value)}
						/>
					</label>
					<div className="omp-settings-nav-scroll">
						{visibleNav.map((group) => (
							<div key={group.title} className="omp-settings-nav-group">
								<div className="omp-settings-nav-title">{group.title}</div>
								{group.items.map((item) => (
									<button
										key={item.id}
										type="button"
										className={activeNav === item.id ? "active" : ""}
										onClick={() => {
											setActiveNav(item.id);
											navTo(item.id);
										}}
									>
										<SetIcon name={item.icon} size={14} />
										{item.label}
									</button>
								))}
							</div>
						))}
						{visibleNav.length === 0 && <p className="omp-set-nav-empty">没有匹配的设置项</p>}
					</div>
				</aside>
				<div className="omp-settings-main">
					<div className="omp-settings-head">
						<div>
							<strong>{activeItem.label}</strong>
							<span>{activeItem.desc}</span>
						</div>
						<button
							type="button"
							className="omp-settings-close"
							onClick={onClose}
							aria-label="关闭设置"
						>
							×
						</button>
					</div>
					<div className="omp-settings-body" ref={bodyRef} onScroll={onScroll}>
						<section id="omp-settings-general" className="omp-settings-section">
							<div className="omp-settings-card">
								<Row title="开机自动启动" desc="登录系统后自动启动应用。">
									<Toggle
										checked={draft.openAtLogin}
										label="开机自动启动"
										onChange={(value) => patch({ openAtLogin: value })}
									/>
								</Row>
								<Row title="运行时防止系统休眠" desc="仅在 omp 会话执行任务期间阻止系统休眠。">
									<Toggle
										checked={draft.preventSystemSleep}
										label="运行时防止系统休眠"
										onChange={(value) => patch({ preventSystemSleep: value })}
									/>
								</Row>
								<Row title="允许锁屏运行" desc="锁屏后仍然保持后台任务运行，屏幕可正常熄灭。">
									<Toggle
										checked={draft.keepAwakeOnLock}
										label="允许锁屏运行"
										onChange={(value) => patch({ keepAwakeOnLock: value })}
									/>
								</Row>
								<Row title="链接打开方式" desc="对话中链接被点击时的行为。">
									<select
										value={draft.linkOpenMode}
										onChange={(event) =>
											patch({ linkOpenMode: event.target.value as LinkOpenMode })
										}
									>
										{Object.entries(LINK_LABEL).map(([value, label]) => (
											<option key={value} value={value}>
												{label}
											</option>
										))}
									</select>
								</Row>
								<div className="omp-set-row omp-set-row-stack">
									<div className="omp-set-row-text">
										<div className="omp-set-row-title">网络代理</div>
										<p className="omp-set-row-desc">
											应用网络立即生效；omp 会话在下次启动时沿用新代理。
										</p>
									</div>
									<div className="omp-set-proxy">
										<select
											value={draft.proxyMode}
											onChange={(event) => patch({ proxyMode: event.target.value as ProxyMode })}
										>
											{Object.entries(PROXY_LABEL).map(([value, label]) => (
												<option key={value} value={value}>
													{label}
												</option>
											))}
										</select>
										{draft.proxyMode === "manual" && (
											<input
												value={draft.proxyUrl}
												placeholder="http://127.0.0.1:7890"
												onChange={(event) => patch({ proxyUrl: event.target.value })}
											/>
										)}
									</div>
								</div>
							</div>
						</section>

						<section id="omp-settings-appearance" className="omp-settings-section">
							<h4>全部主题</h4>
							<div className="omp-settings-card">
								<div className="omp-set-theme-grid">
									{(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
										<button
											key={mode}
											type="button"
											className={`omp-set-theme-card ${draft.theme === mode ? "active" : ""}`}
											onClick={() => patch({ theme: mode })}
										>
											<span className={`omp-set-theme-thumb ${mode}`}>
												<i />
												<i />
												<i />
												{mode === "system" && <b />}
											</span>
											<span className="omp-set-theme-name">{THEME_LABEL[mode]}</span>
										</button>
									))}
								</div>
								<Row title="字体大小" desc="缩放整个界面的字号，默认 100%。">
									<div className="omp-set-range">
										<input
											type="range"
											min={0.85}
											max={1.25}
											step={0.05}
											value={draft.fontScale}
											aria-label="字体大小"
											onChange={(event) => patch({ fontScale: Number(event.target.value) })}
										/>
										<span>{Math.round(draft.fontScale * 100)}%</span>
									</div>
								</Row>
							</div>
						</section>

						<section id="omp-settings-personal" className="omp-settings-section">
							<div className="omp-settings-card">
								<Row title="助手对你的称呼" desc="omp 在回复里如何称呼你。">
									<input
										className="omp-set-input"
										value={draft.userNickname}
										placeholder="例如：同学"
										onChange={(event) => patch({ userNickname: event.target.value })}
									/>
								</Row>
								<Row title="助手名字" desc="给 omp 一个名字，被问起时用它自称。">
									<input
										className="omp-set-input"
										value={draft.assistantName}
										placeholder="留空则保持默认"
										onChange={(event) => patch({ assistantName: event.target.value })}
									/>
								</Row>
								<Row title="回复风格" desc="写入 omp 的 personality 配置，改变默认语气。">
									<select
										value={draft.replyStyle}
										onChange={(event) => patch({ replyStyle: event.target.value as ReplyStyle })}
									>
										{Object.entries(REPLY_STYLE_LABEL).map(([value, label]) => (
											<option key={value} value={value}>
												{label}
											</option>
										))}
									</select>
								</Row>
								<Row title="首页任务推荐" desc="在空会话里展示可直接点选的示例任务。">
									<Toggle
										checked={draft.homeSuggestions}
										label="首页任务推荐"
										onChange={(value) => patch({ homeSuggestions: value })}
									/>
								</Row>
								<Row
									title="对话后续推荐"
									desc="omp 未提供后续建议接口，客户端无法凭空生成可靠的任务推荐。"
									badge="未支持"
									disabled
								>
									<Toggle
										checked={false}
										disabled
										label="对话后续推荐"
										onChange={() => undefined}
									/>
								</Row>
								<div className="omp-set-row omp-set-row-stack">
									<div className="omp-set-row-text">
										<div className="omp-set-row-title">
											给 omp 的指令
											<span className="omp-set-inline-tag">新建对话生效</span>
										</div>
										<p className="omp-set-row-desc">
											写下你希望 omp 一直遵守的要求，会追加到系统提示里。
										</p>
									</div>
									<textarea
										className="omp-set-textarea"
										value={draft.customInstructions}
										placeholder="例如：回答尽量简洁，先给结论；涉及删除的文件先列清单确认。"
										onChange={(event) => patch({ customInstructions: event.target.value })}
									/>
								</div>
							</div>
						</section>

						<section id="omp-settings-memory" className="omp-settings-section">
							<div className="omp-settings-card">
								<Row
									title="本地记忆与技能"
									desc="开启后 omp 用本地后端记录有长期价值的信息（memory.backend=local）。"
								>
									<Toggle
										checked={draft.memoryMode === "local"}
										label="本地记忆与技能"
										onChange={(value) => patch({ memoryMode: value ? "local" : "off" })}
									/>
								</Row>
								<Row
									title="技能自动进化"
									desc="从会话中自动提炼可复用做法并生成技能（autolearn.enabled）。"
								>
									<Toggle
										checked={draft.autoLearnSkills}
										label="技能自动进化"
										onChange={(value) => patch({ autoLearnSkills: value })}
									/>
								</Row>
								<Row
									title="已安装技能自动更新"
									desc="启动时更新 skills.omp.sh 注册表中的技能；本地手写技能不受影响。"
								>
									<Toggle
										checked={draft.autoUpdateSkills}
										label="已安装技能自动更新"
										onChange={(value) => patch({ autoUpdateSkills: value })}
									/>
								</Row>
								<div className="omp-set-inline-action">
									<button type="button" onClick={() => void updateSkillsNow()} disabled={updating}>
										{updating ? "更新中…" : "立即更新已安装技能"}
									</button>
									<span>
										{ompConfig ? `记忆后端：${ompConfig.memoryBackend || "off"}` : "读取 omp 配置…"}
									</span>
								</div>
								<div className="omp-set-row omp-set-row-stack">
									<div className="omp-set-row-text">
										<div className="omp-set-row-title">
											工作背景
											<span className="omp-set-inline-tag">新建对话生效</span>
										</div>
										<p className="omp-set-row-desc">
											你的岗位、正在推进的项目与技术栈，会随每次会话注入，省去重复交代。
										</p>
									</div>
									<textarea
										className="omp-set-textarea tall"
										value={draft.workBackground}
										placeholder="例如：前端开发，主要负责电商后台与数据统计，常用 Vue 3 + TypeScript，当前在推进前端工具链标准化。"
										onChange={(event) => patch({ workBackground: event.target.value })}
									/>
								</div>
							</div>
						</section>

						<section id="omp-settings-models" className="omp-settings-section">
							<div className="omp-settings-card">
								<div className="omp-set-card-head">
									<div>
										<div className="omp-set-row-title">自定义模型</div>
										<p className="omp-set-row-desc">
											写入 omp 的 models.yml（{models?.path ?? "读取中…"}），仅支持 OpenAI
											兼容接口。
										</p>
									</div>
									<button
										type="button"
										className="omp-set-primary"
										onClick={() =>
											setEditor({
												provider: "",
												id: "",
												name: "",
												baseUrl: "",
												apiKey: "",
												supportsTools: true,
												reasoning: false,
												vision: false,
												contextWindow: 128000,
												maxTokens: 32768,
											})
										}
									>
										添加模型
									</button>
								</div>
								<div className="omp-set-model-list">
									{(models?.models ?? []).map((model) => (
										<div className="omp-set-model-row" key={`${model.provider}/${model.id}`}>
											<div className="omp-set-model-main">
												<div className="omp-set-model-name">
													{model.name || model.id}
													<span className="omp-set-badge soft">{model.provider}</span>
													{model.vision && <span className="omp-set-badge soft">图片</span>}
													{model.reasoning && <span className="omp-set-badge soft">思考</span>}
												</div>
												<div className="omp-set-model-meta">
													{model.id} · {model.baseUrl}
												</div>
											</div>
											<div className="omp-set-model-actions">
												<button
													type="button"
													title="编辑"
													aria-label="编辑模型"
													onClick={() =>
														setEditor({
															provider: model.provider,
															id: model.id,
															name: model.name,
															baseUrl: model.baseUrl,
															api: model.api,
															apiKey: model.apiKey,
															contextWindow: model.contextWindow,
															maxTokens: model.maxTokens,
															supportsTools: model.supportsTools,
															reasoning: model.reasoning,
															vision: model.vision,
														})
													}
												>
													<SetIcon name="pencil" size={14} />
												</button>
												<button
													type="button"
													title="测试连接"
													aria-label="测试连接"
													onClick={async () => {
														const probe = await probeModel(model, model.apiKey);
														setShowNotice(
															probe.ok ? "连接成功" : `连接失败：${probe.message.slice(0, 80)}`,
														);
													}}
												>
													<SetIcon name="plug" size={14} />
												</button>
												<button
													type="button"
													title="删除"
													aria-label="删除模型"
													onClick={() => void removeModel(model)}
												>
													<SetIcon name="trash" size={14} />
												</button>
											</div>
										</div>
									))}
									{models && models.models.length === 0 && (
										<p className="omp-set-empty">还没有自定义模型，点右上角添加。</p>
									)}
								</div>
							</div>
							<div className="omp-settings-card">
								<Row
									title="辅助任务模型"
									desc="用于标题生成、摘要等轻量任务，不影响主对话所用模型。"
								>
									<select
										value={ompConfig?.modelRoles.smol ?? ""}
										onChange={async (event) => {
											const value = event.target.value;
											setError("");
											const result = await window.desktop.omp.setConfig([
												["modelRoles.smol", value || "@default"],
											]);
											if (!result.ok) setError(result.error ?? "写入失败");
											else {
												setShowNotice("辅助模型已更新，新建对话生效");
												void window.desktop.omp
													.config()
													.then(setOmpConfig)
													.catch(() => undefined);
											}
										}}
									>
										<option value="">默认（跟随主模型）</option>
										{(models?.models ?? []).map((model) => (
											<option
												key={`${model.provider}/${model.id}`}
												value={`${model.provider}/${model.id}`}
											>
												{model.name || `${model.provider}/${model.id}`}
											</option>
										))}
									</select>
								</Row>
								<div className="omp-set-inline-action">
									<button type="button" onClick={() => void refreshModels()}>
										重新读取模型配置
									</button>
									<span>改动 models.yml 后需要重启应用才能在主界面选择新模型</span>
								</div>
							</div>
						</section>

						<section id="omp-settings-security" className="omp-settings-section">
							<h4>AI 安全防护</h4>
							<div className="omp-settings-card">
								<Row
									title="模型行为智能审查"
									desc="对应 omp 的审批档位：档位越严，工具调用前越需要你确认。"
								>
									<select
										value={draft.approvalMode}
										onChange={(event) =>
											patch({ approvalMode: event.target.value as ApprovalMode })
										}
									>
										{Object.entries(APPROVAL_LABEL).map(([value, label]) => (
											<option key={value} value={value}>
												{label}
											</option>
										))}
									</select>
								</Row>
								<Row
									title="工具内容注入防护"
									desc="omp 未提供工具返回内容的注入拦截能力，客户端无法在协议层阻断。"
									badge="未支持"
									disabled
								>
									<Toggle
										checked={false}
										disabled
										label="工具内容注入防护"
										onChange={() => undefined}
									/>
								</Row>
								<Row
									title="AI 智能审批"
									desc="需要服务端风险判定模型，本机不具备该能力。"
									badge="未支持"
									disabled
								>
									<span className="omp-set-muted">—</span>
								</Row>
							</div>

							<h4>沙箱安全</h4>
							<div className="omp-settings-card">
								<div className="omp-set-row omp-set-row-stack">
									<div className="omp-set-row-text">
										<div className="omp-set-row-title">文件安全：受限目录</div>
										<p className="omp-set-row-desc">
											列表内目录的任何读写、搜索与命令都需要显式确认（tools.restrictedFolders）。
										</p>
									</div>
									<div className="omp-set-folder-list">
										{draft.restrictedFolders.map((folder) => (
											<span className="omp-set-folder" key={folder} title={folder}>
												<span>{folder}</span>
												<button
													type="button"
													aria-label={`移除 ${folder}`}
													onClick={() =>
														patch({
															restrictedFolders: draft.restrictedFolders.filter(
																(item) => item !== folder,
															),
														})
													}
												>
													×
												</button>
											</span>
										))}
										<button
											type="button"
											className="omp-set-add"
											onClick={() => void addRestrictedFolder()}
										>
											添加目录
										</button>
									</div>
								</div>
								<div className="omp-set-row omp-set-row-stack">
									<div className="omp-set-row-text">
										<div className="omp-set-row-title">命令安全：逐工具策略</div>
										<p className="omp-set-row-desc">
											写入 omp 的 tools.approval，优先级高于审批档位。
										</p>
									</div>
									<div className="omp-set-policy-grid">
										{POLICY_TOOLS.map((tool) => (
											<label key={tool}>
												<span>{POLICY_TOOL_LABEL[tool]}</span>
												<select
													value={draft.toolPolicies[tool] ?? "follow"}
													onChange={(event) =>
														setToolPolicy(tool, event.target.value as ToolPolicy | "follow")
													}
												>
													{Object.entries(POLICY_LABEL).map(([value, label]) => (
														<option key={value} value={value}>
															{label}
														</option>
													))}
												</select>
											</label>
										))}
									</div>
								</div>
								<Row
									title="网络安全"
									desc="omp 在 Windows 上没有域名级网络策略，网络出口只能由系统代理控制。"
									badge="未支持"
									disabled
								>
									<span className="omp-set-muted">—</span>
								</Row>
								<Row
									title="自动备份"
									desc="omp 未提供写入前自动备份；建议用 Git 管理工作区变更。"
									badge="未支持"
									disabled
								>
									<Toggle checked={false} disabled label="自动备份" onChange={() => undefined} />
								</Row>
							</div>

							<h4>数据安全</h4>
							<div className="omp-settings-card">
								<Row title="安全网关" desc="本应用不经过自建网关，请求直连你配置的模型服务。">
									<span className="omp-set-state">未接入</span>
								</Row>
								<Row title="传输加密" desc="仅使用模型服务商提供的 TLS 通道，客户端不做额外加密。">
									<span className="omp-set-state">跟随服务商</span>
								</Row>
								<Row
									title="敏感保护"
									desc="发送前检测 API Key、密码、私钥等疑似敏感内容并拦截确认。"
								>
									<Toggle
										checked={draft.sensitiveGuard}
										label="敏感保护"
										onChange={(value) => patch({ sensitiveGuard: value })}
									/>
								</Row>
								<Row
									title="删除保护"
									desc="omp 的文件删除不走系统回收站，客户端无法接管。"
									badge="未支持"
									disabled
								>
									<span className="omp-set-muted">—</span>
								</Row>
								<Row
									title="批量删除审批"
									desc="删除动作由 omp 工具直接执行，没有批量阈值可拦截。"
									badge="未支持"
									disabled
								>
									<input className="omp-set-input narrow" value="—" readOnly />
								</Row>
							</div>

							<h4>内置运行时</h4>
							<div className="omp-settings-card">
								<div className="omp-set-runtime-list">
									{runtimes.map((runtime) => (
										<div className="omp-set-runtime" key={runtime.id}>
											<span className={`omp-set-dot ${runtime.available ? "on" : ""}`} />
											<div className="omp-set-runtime-text">
												<div className="omp-set-runtime-name">
													{runtime.name}
													{runtime.version && <em>{runtime.version}</em>}
												</div>
												<p>{runtime.note}</p>
											</div>
											<span className={`omp-set-state ${runtime.available ? "ok" : ""}`}>
												{runtime.available ? "可用" : "未检测到"}
											</span>
										</div>
									))}
									{runtimes.length === 0 && <p className="omp-set-empty">正在探测本机运行时…</p>}
								</div>
								<div className="omp-set-inline-action">
									<span>运行时来自本机环境与 omp 的 shellPath，客户端不内置、也不替换它们。</span>
								</div>
							</div>

							<h4>审计中心</h4>
							<div className="omp-settings-card">
								<div className="omp-set-card-head">
									<div>
										<div className="omp-set-row-title">客户端动作记录</div>
										<p className="omp-set-row-desc">
											记录工具调用、审批请求与敏感拦截，共 {audit.length} 条。
										</p>
									</div>
									<div className="omp-set-head-actions">
										<button
											type="button"
											onClick={async () => {
												const result = await window.desktop.audit.export();
												setShowNotice(result.ok ? `已导出到 ${result.path}` : "已取消导出");
											}}
										>
											导出日志
										</button>
										<button
											type="button"
											onClick={async () => {
												await window.desktop.audit.clear();
												refreshAudit();
												setShowNotice("审计记录已清空");
											}}
										>
											清空记录
										</button>
									</div>
								</div>
								<div className="omp-set-audit-list">
									{audit.slice(0, 8).map((entry, index) => (
										<div className="omp-set-audit" key={`${entry.ts}-${index}`}>
											<span className={`omp-set-audit-tag ${entry.level}`}>{entry.category}</span>
											<span className="omp-set-audit-text">
												{entry.action}
												{entry.detail ? ` · ${entry.detail}` : ""}
											</span>
											<span className="omp-set-audit-time">{formatTime(entry.ts)}</span>
										</div>
									))}
									{audit.length === 0 && (
										<p className="omp-set-empty">暂无记录，发起一次对话后会出现工具调用审计。</p>
									)}
								</div>
							</div>
						</section>

						<section id="omp-settings-storage" className="omp-settings-section">
							<div className="omp-settings-card">
								<div className="omp-set-storage">
									<div className="omp-set-row-text">
										<div className="omp-set-row-title">系统缓存目录</div>
										<p className="omp-set-row-desc" title={systemInfo?.cacheDir}>
											{systemInfo?.cacheDir || "读取中…"}
										</p>
									</div>
									<button type="button" onClick={() => void openCache()}>
										打开目录
									</button>
								</div>
								{systemInfo && (
									<div className="omp-set-disk">
										<div className="omp-set-disk-bar">
											<span style={{ width: `${usedPercent}%` }} />
										</div>
										<div className="omp-set-disk-legend">
											<span>磁盘已用 {formatBytes(systemInfo.usedBytes)}</span>
											<span>可用 {formatBytes(systemInfo.availableBytes)}</span>
											<span>共 {formatBytes(systemInfo.totalBytes)}</span>
										</div>
									</div>
								)}
								<div className="omp-set-storage">
									<div className="omp-set-row-text">
										<div className="omp-set-row-title">omp 默认工作空间</div>
										<p className="omp-set-row-desc">新任务默认在该路径下运行，不影响已有会话。</p>
										<input className="omp-set-path" value={draft.cwd} readOnly title={draft.cwd} />
									</div>
									<button type="button" onClick={() => void pickWorkspace()}>
										更改
									</button>
								</div>
							</div>
						</section>

						<section id="omp-settings-advanced" className="omp-settings-section">
							<div className="omp-settings-card">
								<div className="omp-set-stack">
									<label>
										<span>omp CLI 路径</span>
										<input
											value={draft.ompCliPath}
											onChange={(event) => patch({ ompCliPath: event.target.value })}
										/>
									</label>
									<label>
										<span>bun 路径</span>
										<input
											value={draft.bunPath}
											onChange={(event) => patch({ bunPath: event.target.value })}
										/>
									</label>
									<label>
										<span>omp 配置文件</span>
										<input value={ompConfig?.configPath ?? ""} readOnly />
									</label>
									<label>
										<span>模型配置文件</span>
										<input value={models?.path ?? ""} readOnly />
									</label>
								</div>
							</div>
						</section>
					</div>
					<div className="omp-settings-footer">
						{error && <span className="omp-set-error">{error}</span>}
						{!error && notice && <span className="omp-set-notice">{notice}</span>}
						<button type="button" className="secondary" onClick={onClose}>
							取消
						</button>
						<button type="button" className="primary" onClick={() => void save()} disabled={saving}>
							{saving ? "保存中…" : "保存"}
						</button>
					</div>
				</div>
			</div>
			{editor && (
				<ModelEditor
					initial={editor}
					existingProviders={Array.from(new Set((models?.models ?? []).map((m) => m.provider)))}
					onClose={() => setEditor(null)}
					onSave={saveModel}
					onTest={probeModel}
				/>
			)}
		</div>
	);
}

function ModelEditor({
	initial,
	existingProviders,
	onClose,
	onSave,
	onTest,
}: {
	initial: ModelInputData;
	existingProviders: string[];
	onClose(): void;
	onSave(input: ModelInputData): Promise<void>;
	onTest(model: CustomModelEntry, apiKey: string): Promise<{ ok: boolean; message: string }>;
}) {
	const [form, setForm] = useState<ModelInputData>(initial);
	const [testing, setTesting] = useState(false);
	const [probe, setProbe] = useState("");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	const isEdit = Boolean(initial.provider && initial.id);

	const patch = (next: Partial<ModelInputData>) => setForm((prev) => ({ ...prev, ...next }));

	const runTest = async () => {
		setProbe("");
		setError("");
		if (!form.baseUrl || !form.id) {
			setError("先填接口地址与模型 ID");
			return;
		}
		setTesting(true);
		try {
			const result = await onTest(
				{
					provider: form.provider,
					id: form.id,
					name: form.name || form.id,
					baseUrl: form.baseUrl,
					api: form.api ?? "",
					apiKey: form.apiKey ?? "",
					supportsTools: true,
					reasoning: false,
					vision: false,
				},
				form.apiKey ?? "",
			);
			setProbe(result.ok ? "连接成功" : `连接失败：${result.message.slice(0, 140)}`);
		} catch (cause) {
			setProbe(`连接失败：${cleanError(cause)}`);
		} finally {
			setTesting(false);
		}
	};

	const submit = async () => {
		setError("");
		setSaving(true);
		try {
			await onSave(form);
		} catch (cause) {
			setError(cleanError(cause));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="omp-modal-layer nested" role="dialog" aria-modal="true" aria-label="编辑模型">
			<div className="omp-modal omp-model-modal">
				<div className="omp-model-modal-head">
					<h3>{isEdit ? "编辑模型" : "添加模型"}</h3>
					<button type="button" className="omp-settings-close" onClick={onClose} aria-label="关闭">
						×
					</button>
				</div>
				<p className="omp-model-modal-desc">仅支持 OpenAI 兼容协议的 API。</p>
				<label className="omp-model-field">
					<span>供应商标识</span>
					<input
						value={form.provider}
						placeholder="例如 my-gateway（小写字母 / 数字 / - _）"
						disabled={isEdit}
						onChange={(event) => patch({ provider: event.target.value })}
					/>
					{existingProviders.length > 0 && !isEdit && <em>已有：{existingProviders.join("、")}</em>}
				</label>
				<label className="omp-model-field">
					<span>接口地址</span>
					<input
						value={form.baseUrl}
						placeholder="https://example.com/v1"
						onChange={(event) => patch({ baseUrl: event.target.value })}
					/>
				</label>
				<label className="omp-model-field">
					<span>API Key</span>
					<div className="omp-model-key">
						<input
							type="password"
							value={form.apiKey ?? ""}
							placeholder={isEdit ? "留空则不修改已保存的 Key" : "粘贴你的 API Key"}
							onChange={(event) => patch({ apiKey: event.target.value })}
						/>
						<button type="button" onClick={() => void runTest()} disabled={testing}>
							{testing ? "测试中…" : "测试连接"}
						</button>
					</div>
				</label>
				<label className="omp-model-field">
					<span>模型 ID</span>
					<input
						value={form.id}
						placeholder="服务商文档里的 model 名称"
						disabled={isEdit}
						onChange={(event) => patch({ id: event.target.value })}
					/>
				</label>
				<label className="omp-model-field">
					<span>显示名称</span>
					<input
						value={form.name}
						placeholder="模型列表里展示的名字"
						onChange={(event) => patch({ name: event.target.value })}
					/>
				</label>
				<div className="omp-model-field">
					<span>能力</span>
					<div className="omp-model-checks">
						<label>
							<input
								type="checkbox"
								checked={form.supportsTools !== false}
								onChange={(event) => patch({ supportsTools: event.target.checked })}
							/>
							工具调用
						</label>
						<label>
							<input
								type="checkbox"
								checked={Boolean(form.vision)}
								onChange={(event) => patch({ vision: event.target.checked })}
							/>
							图片输入
						</label>
						<label>
							<input
								type="checkbox"
								checked={Boolean(form.reasoning)}
								onChange={(event) => patch({ reasoning: event.target.checked })}
							/>
							思考模式
						</label>
					</div>
				</div>
				<div className="omp-model-row">
					<label className="omp-model-field">
						<span>上下文窗口</span>
						<input
							type="number"
							value={form.contextWindow ?? 0}
							onChange={(event) => patch({ contextWindow: Number(event.target.value) })}
						/>
					</label>
					<label className="omp-model-field">
						<span>最大输出</span>
						<input
							type="number"
							value={form.maxTokens ?? 0}
							onChange={(event) => patch({ maxTokens: Number(event.target.value) })}
						/>
					</label>
				</div>
				{probe && (
					<p className={`omp-model-probe ${probe.startsWith("连接成功") ? "ok" : ""}`}>{probe}</p>
				)}
				{error && <p className="omp-set-error">{error}</p>}
				<div className="omp-modal-actions">
					<button type="button" className="secondary" onClick={onClose}>
						取消
					</button>
					<button type="button" className="primary" onClick={() => void submit()} disabled={saving}>
						{saving ? "保存中…" : "保存"}
					</button>
				</div>
			</div>
		</div>
	);
}
