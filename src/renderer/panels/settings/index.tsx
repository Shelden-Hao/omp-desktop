import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	AuditEntry,
	CustomModelEntry,
	CustomModelState,
	DesktopSettings,
	ModelInputData,
	OmpConfigData,
	RuntimeInfo,
	SystemInfoData,
} from "../../../shared/types";
import { ConfirmDialog } from "../../components/modals/ConfirmDialog";
import { ModelEditor } from "./ModelEditor";
import { AdvancedPane } from "./panes/AdvancedPane";
import { AppearancePane } from "./panes/AppearancePane";
import { GeneralPane } from "./panes/GeneralPane";
import { MemoryPane } from "./panes/MemoryPane";
import { ModelsPane } from "./panes/ModelsPane";
import { PersonalPane } from "./panes/PersonalPane";
import { SecurityPane } from "./panes/SecurityPane";
import { StoragePane } from "./panes/StoragePane";
import { NAV, navTo } from "./settings-nav";
import { SetIcon } from "./SetIcon";
import { cleanError, probeModel } from "./util";

interface SettingsPanelProps {
	settings: DesktopSettings;
	onClose(): void;
	onSave(next: DesktopSettings): Promise<void>;
}

/** 新建模型时的空白表单 */
const BLANK_MODEL: ModelInputData = {
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
};

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
	/** 危险操作二次确认：null 表示没有待确认项 */
	const [pendingConfirm, setPendingConfirm] = useState<
		{ kind: "remove-model"; model: CustomModelEntry } | { kind: "clear-audit" } | null
	>(null);
	const [saving, setSaving] = useState(false);
	const bodyRef = useRef<HTMLDivElement | null>(null);
	/** 点击导航后短暂屏蔽滚动联动，否则 scrollIntoView 触发的 scroll 会立刻把选中项改回上一节 */
	const navLockRef = useRef(0);

	const refreshAudit = useCallback(() => {
		void window.desktop.audit
			.list()
			.then(setAudit)
			.catch(() => setAudit([]));
	}, []);

	const reloadOmpConfig = useCallback(() => {
		void window.desktop.omp
			.config()
			.then(setOmpConfig)
			.catch(() => undefined);
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

	const notify = (text: string) => {
		setNotice(text);
		window.setTimeout(() => setNotice(""), 4000);
	};

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
		if (Date.now() < navLockRef.current) return;
		const items = visibleNav.flatMap((group) => group.items);
		if (!items.length) return;
		// 滚到底时最后一节露不全，只能按「最后一项」判定，否则永远高亮倒数第二项
		if (container.scrollTop + container.clientHeight >= container.scrollHeight - 8) {
			const last = items[items.length - 1];
			if (activeNav !== last.id) setActiveNav(last.id);
			return;
		}
		const top = container.getBoundingClientRect().top + 12;
		let current = activeNav;
		for (const item of items) {
			const node = document.getElementById(`omp-settings-${item.id}`);
			if (!node) continue;
			if (node.getBoundingClientRect().top <= top) current = item.id;
		}
		if (current !== activeNav) setActiveNav(current);
	};

	const pickWorkspace = () => {
		void (async () => {
			setError("");
			const dir = await window.desktop.system.pickDirectory();
			if (dir) patch({ cwd: dir });
		})();
	};

	const openCache = () => {
		void (async () => {
			setError("");
			if (!systemInfo) return;
			const result = await window.desktop.system.openPath(systemInfo.cacheDir);
			if (!result.ok) setError(result.error ?? "打开缓存目录失败");
		})();
	};

	const updateSkillsNow = () => {
		void (async () => {
			setError("");
			setNotice("");
			setUpdating(true);
			try {
				const summary = await window.desktop.skills.updateAll();
				if (summary.failed) notify(`更新失败：${summary.errors[0] ?? "未知错误"}`);
				else
					notify(summary.updated > 0 ? `已更新 ${summary.updated} 个技能` : "注册表技能已是最新");
			} catch (cause) {
				setError(cleanError(cause) || "更新技能失败");
			} finally {
				setUpdating(false);
			}
		})();
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
			notify("设置已保存，标注「新建对话生效」的项目需要重启会话");
			reloadOmpConfig();
		} catch (cause) {
			setError(cleanError(cause) || "设置保存失败");
		} finally {
			setSaving(false);
		}
	};

	const refreshModels = () => {
		void (async () => {
			try {
				setModels(await window.desktop.models.list());
			} catch (cause) {
				setError(cleanError(cause));
			}
		})();
	};

	const saveModel = async (input: ModelInputData) => {
		const state = await window.desktop.models.save(input);
		setModels(state);
		setEditor(null);
		notify("模型已保存，重启对话后可在模型列表中看到");
	};

	const removeModel = (model: CustomModelEntry) => {
		setPendingConfirm({ kind: "remove-model", model });
	};

	const clearAudit = () => {
		setPendingConfirm({ kind: "clear-audit" });
	};

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
											navLockRef.current = Date.now() + 500;
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
						{/* 渲染顺序必须与 settings-nav.ts 的 NAV 顺序一致，滚动联动按 id 定位分区 */}
						<GeneralPane draft={draft} patch={patch} setError={setError} notify={notify} />
						<AppearancePane draft={draft} patch={patch} setError={setError} notify={notify} />
						<StoragePane
							draft={draft}
							patch={patch}
							setError={setError}
							notify={notify}
							systemInfo={systemInfo}
							onOpenCache={openCache}
							onPickWorkspace={pickWorkspace}
						/>
						<PersonalPane draft={draft} patch={patch} setError={setError} notify={notify} />
						<MemoryPane
							draft={draft}
							patch={patch}
							setError={setError}
							notify={notify}
							ompConfig={ompConfig}
							updating={updating}
							onUpdateSkills={updateSkillsNow}
						/>
						<ModelsPane
							draft={draft}
							patch={patch}
							setError={setError}
							notify={notify}
							models={models}
							ompConfig={ompConfig}
							onAddModel={() => setEditor({ ...BLANK_MODEL })}
							onEditModel={(model) =>
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
							onRemoveModel={removeModel}
							onRefreshModels={refreshModels}
							reloadOmpConfig={reloadOmpConfig}
						/>
						<SecurityPane
							draft={draft}
							patch={patch}
							setError={setError}
							notify={notify}
							runtimes={runtimes}
							audit={audit}
							onClearAudit={clearAudit}
						/>
						<AdvancedPane
							draft={draft}
							patch={patch}
							setError={setError}
							notify={notify}
							ompConfig={ompConfig}
							models={models}
						/>
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
			{pendingConfirm && (
				<ConfirmDialog
					title={
						pendingConfirm.kind === "remove-model"
							? `删除模型 ${pendingConfirm.model.provider}/${pendingConfirm.model.id}`
							: "清空审计记录"
					}
					message={
						pendingConfirm.kind === "remove-model"
							? "会从 omp 配置中彻底移除该模型，无法恢复。确认删除吗？"
							: `将清空全部 ${audit.length} 条本地审计记录，无法恢复。确认清空吗？`
					}
					confirmLabel={pendingConfirm.kind === "remove-model" ? "删除" : "清空"}
					onConfirm={() => {
						const pending = pendingConfirm;
						setPendingConfirm(null);
						if (pending.kind === "remove-model") {
							void (async () => {
								try {
									const state = await window.desktop.models.remove(
										pending.model.provider,
										pending.model.id,
									);
									setModels(state);
									notify(`已删除 ${pending.model.provider}/${pending.model.id}`);
								} catch (cause) {
									setError(cleanError(cause));
								}
							})();
						} else {
							void (async () => {
								try {
									await window.desktop.audit.clear();
									refreshAudit();
									notify("审计记录已清空");
								} catch (cause) {
									setError(cleanError(cause));
								}
							})();
						}
					}}
					onCancel={() => setPendingConfirm(null)}
				/>
			)}
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
