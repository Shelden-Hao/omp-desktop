import { useEffect, useState, type ReactNode } from "react";
import type {
	ApprovalMode,
	DesktopSettings,
	LinkOpenMode,
	ProxyMode,
	SystemInfoData,
	ThemeMode,
} from "./acp-client";

interface SettingsPanelProps {
	settings: DesktopSettings;
	onClose(): void;
	onSave(next: DesktopSettings): Promise<void>;
}

const NAV = [
	{ id: "general", label: "常规" },
	{ id: "runtime", label: "权限与运行" },
	{ id: "skills", label: "技能" },
	{ id: "storage", label: "存储" },
	{ id: "advanced", label: "高级" },
] as const;

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

const APPROVAL_LABEL: Record<ApprovalMode, string> = {
	"always-ask": "每次询问",
	"always-ask-cached": "询问并记住",
	write: "自动写入",
	yolo: "全部允许",
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

function navTo(id: string) {
	document.getElementById(`omp-settings-${id}`)?.scrollIntoView();
}

function Row({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
	return (
		<div className="omp-set-row">
			<div className="omp-set-row-text">
				<div className="omp-set-row-title">{title}</div>
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
}: {
	checked: boolean;
	onChange(next: boolean): void;
	label: string;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
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
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [updating, setUpdating] = useState(false);

	useEffect(() => {
		void window.desktop.system
			.info()
			.then(setSystemInfo)
			.catch(() => setSystemInfo(null));
	}, []);

	const patch = (next: Partial<DesktopSettings>) => setDraft((prev) => ({ ...prev, ...next }));

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
			if (summary.failed) {
				setNotice(`更新失败：${summary.errors[0] ?? "未知错误"}`);
			} else {
				setNotice(summary.updated > 0 ? `已更新 ${summary.updated} 个技能` : "注册表技能已是最新");
			}
		} catch (cause) {
			setError((cause as Error).message || "更新技能失败");
		} finally {
			setUpdating(false);
		}
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
		try {
			await onSave(draft);
		} catch (cause) {
			setError((cause as Error).message || "设置保存失败");
		}
	};

	const usedPercent =
		systemInfo && systemInfo.totalBytes > 0
			? Math.min(100, (systemInfo.usedBytes / systemInfo.totalBytes) * 100)
			: 0;

	return (
		<div className="omp-modal-layer" role="dialog" aria-modal="true" aria-label="设置">
			<div className="omp-settings-shell">
				<aside className="omp-settings-nav">
					<div className="omp-settings-nav-title">设置</div>
					{NAV.map((item) => (
						<button key={item.id} type="button" onClick={() => navTo(item.id)}>
							{item.label}
						</button>
					))}
				</aside>
				<div className="omp-settings-main">
					<div className="omp-settings-head">
						<div>
							<strong>通用设置</strong>
							<span>修改后点击保存；涉及系统行为的项目会立即生效。</span>
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
					<div className="omp-settings-body">
						<section id="omp-settings-general" className="omp-settings-section">
							<h4>常规</h4>
							<div className="omp-settings-card">
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
								<Row title="链接打开方式" desc="控制对话中链接被点击时的行为，避免误点直接跳出。">
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
							</div>
						</section>

						<section id="omp-settings-runtime" className="omp-settings-section">
							<h4>权限与运行</h4>
							<div className="omp-settings-card">
								<Row title="允许锁屏运行" desc="锁屏后仍保持后台任务运行；屏幕可以正常熄灭。">
									<select
										value={draft.keepAwakeOnLock ? "awake" : "normal"}
										onChange={(event) => patch({ keepAwakeOnLock: event.target.value === "awake" })}
									>
										<option value="awake">锁屏后保持运行</option>
										<option value="normal">锁屏后允许挂起</option>
									</select>
								</Row>
								<Row title="运行时防止系统休眠" desc="仅在 omp 会话执行任务期间阻止系统进入休眠。">
									<Toggle
										checked={draft.preventSystemSleep}
										label="运行时防止系统休眠"
										onChange={(value) => patch({ preventSystemSleep: value })}
									/>
								</Row>
								<Row title="开机自动启动" desc="登录系统后自动启动 OMP Desktop。">
									<Toggle
										checked={draft.openAtLogin}
										label="开机自动启动"
										onChange={(value) => patch({ openAtLogin: value })}
									/>
								</Row>
								<div className="omp-set-row omp-set-row-stack">
									<div className="omp-set-row-text">
										<div className="omp-set-row-title">网络代理</div>
										<p className="omp-set-row-desc">网络异常时可切换连接方式，保存后立即生效。</p>
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

						<section id="omp-settings-skills" className="omp-settings-section">
							<h4>技能</h4>
							<div className="omp-settings-card">
								<Row
									title="自动安装可信技能"
									desc="仅对官方 scope 或标记为 official/trusted 的技能跳过安装确认；其它技能仍会询问。"
								>
									<Toggle
										checked={draft.autoInstallTrustedSkills}
										label="自动安装可信技能"
										onChange={(value) => patch({ autoInstallTrustedSkills: value })}
									/>
								</Row>
								<Row
									title="技能自动更新"
									desc="启动时通过 omp 更新 skills.omp.sh 注册表中已安装的技能；本地手写技能不受影响。"
								>
									<Toggle
										checked={draft.autoUpdateSkills}
										label="技能自动更新"
										onChange={(value) => patch({ autoUpdateSkills: value })}
									/>
								</Row>
								<div className="omp-set-inline-action">
									<button type="button" onClick={() => void updateSkillsNow()} disabled={updating}>
										{updating ? "更新中…" : "立即更新已安装技能"}
									</button>
									{notice && <span>{notice}</span>}
								</div>
							</div>
						</section>

						<section id="omp-settings-storage" className="omp-settings-section">
							<h4>存储</h4>
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
										<div className="omp-set-row-title">omp 默认工作空间存储路径</div>
										<p className="omp-set-row-desc">
											新任务默认在该路径下运行；修改不影响已有会话。
										</p>
										<input
											className="omp-set-path"
											value={draft.cwd}
											readOnly
											title={draft.cwd}
											onChange={() => undefined}
										/>
									</div>
									<button type="button" onClick={() => void pickWorkspace()}>
										更改
									</button>
								</div>
							</div>
						</section>

						<section id="omp-settings-advanced" className="omp-settings-section">
							<h4>高级</h4>
							<div className="omp-settings-card">
								<Row title="主题" desc="跟随系统或固定使用浅色 / 深色。">
									<select
										value={draft.theme}
										onChange={(event) => patch({ theme: event.target.value as ThemeMode })}
									>
										{Object.entries(THEME_LABEL).map(([value, label]) => (
											<option key={value} value={value}>
												{label}
											</option>
										))}
									</select>
								</Row>
								<Row title="工具审批档位" desc="切换后新建会话生效。">
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
								</div>
							</div>
						</section>
					</div>
					<div className="omp-settings-footer">
						{error && <span className="omp-set-error">{error}</span>}
						<button type="button" className="secondary" onClick={onClose}>
							取消
						</button>
						<button type="button" className="primary" onClick={() => void save()}>
							保存
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
