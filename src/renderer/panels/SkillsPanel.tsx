/**
 * 技能面板：数据全部来自 omp CLI（skill list / search / info / install / publish）。
 * 全局技能由 omp 在 ~/.omp/agent/skills 等目录发现，项目技能在 <cwd>/.omp/skills，
 * 启停通过 omp 的 skills.ignoredSkills 配置，不在外壳侧另造状态。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { SkillPathsData, SkillScope, SkillSearchData, SkillSummary } from "../../shared/types";

type Tab = "installed" | "market";
type Sort = "relevance" | "downloads" | "recent";

interface SkillPanelProps {
	cwd: string;
	autoInstallTrustedSkills: boolean;
	onClose(): void;
	onUseSkill(name: string): void;
}

interface MarketHit {
	scope: string;
	name: string;
	fullName: string;
	description: string;
	weeklyDownloads?: number;
	updatedAt?: number | string;
	keywords: string[];
}

const SORT_LABEL: Record<Sort, string> = {
	relevance: "综合",
	downloads: "下载量",
	recent: "最新",
};

const SCOPE_LABEL: Record<SkillScope, string> = {
	user: "用户级（全局）",
	project: "项目级",
};

function scopeOf(source: string): SkillScope {
	return source.endsWith(":project") ? "project" : "user";
}

function initials(name: string): string {
	return name.replace(/^@/, "").slice(0, 2).toUpperCase();
}

function shortNumber(value?: number): string {
	if (value === undefined) return "—";
	if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
	return String(value);
}

function isTrustedHit(hit: MarketHit): boolean {
	// omp 市场没有独立的“已安全扫描”字段：只认官方 scope 或官方标记的关键词，
	// 其余技能一律保留人工确认，避免把普通第三方包当成可信包静默安装。
	const trustedMarkers = new Set(["omp", "official", "verified", "trusted"]);
	return (
		trustedMarkers.has(hit.scope.toLowerCase()) ||
		hit.keywords.some((keyword) => trustedMarkers.has(keyword.toLowerCase()))
	);
}

function toHits(data: SkillSearchData | undefined): MarketHit[] {
	return (data?.hits ?? []).map((hit) => {
		const scope = hit.scope ?? "";
		const name = hit.name ?? "未命名技能";
		return {
			scope,
			name,
			fullName: scope ? `@${scope}/${name}` : name,
			description: typeof hit.description === "string" ? hit.description : "",
			weeklyDownloads: hit.weeklyDownloads,
			updatedAt: hit.updatedAt,
			keywords: Array.isArray(hit.keywords)
				? hit.keywords.filter((keyword): keyword is string => typeof keyword === "string")
				: [],
		};
	});
}

function detailText(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) return value.map((item) => detailText(item)).join(", ");
	return "";
}

export function SkillsPanel({
	cwd,
	autoInstallTrustedSkills,
	onClose,
	onUseSkill,
}: SkillPanelProps) {
	const [tab, setTab] = useState<Tab>("installed");
	const [skills, setSkills] = useState<SkillSummary[]>([]);
	const [warnings, setWarnings] = useState<string[]>([]);
	const [ignored, setIgnored] = useState<string[]>([]);
	const [paths, setPaths] = useState<SkillPathsData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<Sort>("relevance");
	const [hits, setHits] = useState<MarketHit[]>([]);
	const [searching, setSearching] = useState(false);
	const [selected, setSelected] = useState<
		| { kind: "installed"; skill: SkillSummary; enabled: boolean }
		| { kind: "market"; hit: MarketHit }
		| null
	>(null);
	const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
	const [detailBusy, setDetailBusy] = useState(false);
	const [addMenu, setAddMenu] = useState(false);
	const [showCreate, setShowCreate] = useState(false);
	const [showPublish, setShowPublish] = useState(false);
	const [newName, setNewName] = useState("");
	const [newDescription, setNewDescription] = useState("");
	const [newScope, setNewScope] = useState<SkillScope>("user");
	const [publishDir, setPublishDir] = useState("");
	const [publishScope, setPublishScope] = useState("");
	const [scopeFilter, setScopeFilter] = useState<"all" | SkillScope>("all");
	const [installScope, setInstallScope] = useState<SkillScope>("user");
	const [busyName, setBusyName] = useState("");
	const searchRef = useRef<HTMLInputElement>(null);
	const addRef = useRef<HTMLDivElement>(null);

	const flash = (text: string) => {
		setNotice(text);
		window.setTimeout(() => setNotice((current) => (current === text ? "" : current)), 4000);
	};

	const loadInstalled = useCallback(async () => {
		setLoading(true);
		setError("");
		const [listReply, configReply, pathsReply] = await Promise.all([
			window.desktop.skills.list(cwd),
			window.desktop.skills.config("skills.ignoredSkills"),
			window.desktop.skills.paths(),
		]);
		if (!listReply.ok || !listReply.data) {
			setError(listReply.error ?? "读取技能列表失败");
			setLoading(false);
			return;
		}
		setSkills(listReply.data.skills);
		setWarnings(listReply.data.warnings.map((item) => item.message));
		const ignoredValue = configReply.data;
		setIgnored(
			Array.isArray(ignoredValue)
				? ignoredValue.filter((item): item is string => typeof item === "string")
				: [],
		);
		if (pathsReply.data) setPaths(pathsReply.data);
		setLoading(false);
	}, [cwd]);

	useEffect(() => {
		// 异步读取 omp 数据，放到微任务避免 effect 内同步 setState 触发级联渲染
		void Promise.resolve().then(() => void loadInstalled());
	}, [loadInstalled]);

	useEffect(() => {
		const onPointer = (event: MouseEvent) => {
			if (addRef.current && !addRef.current.contains(event.target as Node)) setAddMenu(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("mousedown", onPointer);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onPointer);
			document.removeEventListener("keydown", onKey);
		};
	}, [onClose]);

	const runSearch = useCallback(
		async (text: string) => {
			if (!text.trim()) {
				setHits([]);
				return;
			}
			setSearching(true);
			const reply = await window.desktop.skills.search(text, sort);
			if (reply.ok && reply.data) {
				setHits(toHits(reply.data));
			} else {
				setHits([]);
				setError(reply.error ?? "搜索技能失败");
			}
			setSearching(false);
		},
		[sort],
	);

	useEffect(() => {
		if (tab !== "market" || !query.trim()) return;
		const timer = window.setTimeout(() => void runSearch(query), 350);
		return () => window.clearTimeout(timer);
	}, [query, tab, runSearch]);

	const openDetail = async (item: NonNullable<typeof selected>) => {
		setSelected(item);
		setDetail(null);
		if (item.kind !== "market") return;
		setDetailBusy(true);
		const reply = await window.desktop.skills.info(item.hit.fullName);
		setDetail(reply.ok ? (reply.data ?? null) : null);
		if (!reply.ok) flash(reply.error ?? "读取技能详情失败");
		setDetailBusy(false);
	};

	const toggleSkill = async (skill: SkillSummary, enabled: boolean) => {
		setBusyName(skill.name);
		const reply = await window.desktop.skills.enabled(skill.name, enabled);
		if (reply.ok) {
			await loadInstalled();
			setSelected(null);
			flash(`${enabled ? "已启用" : "已禁用"}技能 ${skill.name}`);
		} else {
			flash(reply.error ?? "更新技能状态失败");
		}
		setBusyName("");
	};

	const uninstall = async (skill: SkillSummary) => {
		if (!window.confirm(`确定卸载技能 ${skill.name}？此操作由 omp 执行，会删除已安装的技能文件。`))
			return;
		setBusyName(skill.name);
		const reply = await window.desktop.skills.uninstall(skill.name, scopeOf(skill.source));
		setBusyName("");
		if (reply.ok) {
			await loadInstalled();
			setSelected(null);
			flash(`已卸载 ${skill.name}`);
		} else {
			flash(reply.error ?? "卸载失败");
		}
	};

	const install = async (hit: MarketHit) => {
		const trusted = isTrustedHit(hit);
		if (!(autoInstallTrustedSkills && trusted)) {
			const hint = trusted ? "该技能被标记为可信。" : "该技能未标记为可信。";
			if (!window.confirm(`安装技能 ${hit.fullName}？${hint}`)) return;
		}
		setBusyName(hit.fullName);
		const reply = await window.desktop.skills.install(hit.fullName, installScope);
		setBusyName("");
		if (reply.ok) {
			await loadInstalled();
			setTab("installed");
			flash(`已安装 ${hit.fullName} 到${SCOPE_LABEL[installScope]}`);
		} else {
			flash(reply.error ?? "安装失败");
		}
	};

	const create = async () => {
		if (!newName.trim() || !newDescription.trim()) {
			flash("请填写技能名和描述");
			return;
		}
		const reply = await window.desktop.skills.create({
			name: newName.trim(),
			description: newDescription.trim(),
			scope: newScope,
		});
		if (!reply.ok) {
			flash(reply.error ?? "创建技能失败");
			return;
		}
		setShowCreate(false);
		setNewName("");
		setNewDescription("");
		await loadInstalled();
		setTab("installed");
		flash("技能已创建，编辑 SKILL.md 即可补充内容");
	};

	const publish = async () => {
		const reply = await window.desktop.skills.publish(publishDir.trim(), publishScope.trim());
		if (!reply.ok) {
			flash(reply.error ?? "发布技能失败");
			return;
		}
		setShowPublish(false);
		flash("技能已发布到 Skillshare");
	};

	const activeSkills = skills.filter(
		(skill) => scopeFilter === "all" || scopeOf(skill.source) === scopeFilter,
	);
	const disabledNames = ignored.filter((name) => !skills.some((skill) => skill.name === name));
	const disabledSkills: SkillSummary[] = disabledNames.map((name) => ({
		name,
		description: "已通过 omp 配置禁用",
		filePath: "",
		baseDir: "",
		source: "skills.ignoredSkills",
		hide: false,
	}));
	const userSkills = activeSkills.filter((skill) => scopeOf(skill.source) === "user");
	const projectSkills = activeSkills.filter((skill) => scopeOf(skill.source) === "project");

	const renderInstalledCard = (skill: SkillSummary, enabled = true) => (
		<div
			key={skill.name}
			className={`omp-skill-card ${enabled ? "" : "disabled"}`}
			onClick={() => void openDetail({ kind: "installed", skill, enabled })}
		>
			<div className="omp-skill-card-icon">{initials(skill.name)}</div>
			<div className="omp-skill-card-body">
				<div className="omp-skill-card-title">{skill.name}</div>
				<p className="omp-skill-card-desc">{skill.description || "暂无描述"}</p>
				<div className="omp-skill-card-meta">
					<span className="omp-skill-tag">{skill.source}</span>
					<span>{scopeOf(skill.source) === "user" ? "全局" : "项目"}</span>
				</div>
			</div>
			<div className="omp-skill-card-actions" onClick={(event) => event.stopPropagation()}>
				<label
					className="omp-skill-switch"
					title={busyName === skill.name ? "处理中" : "启用 / 禁用"}
				>
					<input
						type="checkbox"
						checked={enabled}
						disabled={busyName === skill.name}
						onChange={() => void toggleSkill(skill, !enabled)}
					/>
					<span />
				</label>
				{enabled && (
					<button
						type="button"
						className="omp-skill-mini"
						onClick={() => onUseSkill(skill.name)}
						title="在会话中插入 /skill 命令"
					>
						使用
					</button>
				)}
				{enabled && (
					<button
						type="button"
						className="omp-skill-mini danger"
						onClick={() => void uninstall(skill)}
					>
						卸载
					</button>
				)}
			</div>
		</div>
	);

	const renderMarketCard = (hit: MarketHit) => (
		<div
			key={hit.fullName}
			className="omp-skill-card"
			onClick={() => void openDetail({ kind: "market", hit })}
		>
			<div className="omp-skill-card-icon market">{initials(hit.name)}</div>
			<div className="omp-skill-card-body">
				<div className="omp-skill-card-title">{hit.fullName}</div>
				<p className="omp-skill-card-desc">{hit.description || "暂无描述"}</p>
				<div className="omp-skill-card-meta">
					<span>周下载 {shortNumber(hit.weeklyDownloads)}</span>
				</div>
			</div>
			<div className="omp-skill-card-actions" onClick={(event) => event.stopPropagation()}>
				<button
					type="button"
					className="omp-skill-mini primary"
					disabled={busyName === hit.fullName}
					onClick={() => void install(hit)}
					title={`安装到${SCOPE_LABEL[installScope]}`}
				>
					{busyName === hit.fullName ? "安装中" : "+ 安装"}
				</button>
			</div>
		</div>
	);

	return (
		<div className="omp-skill-layer" role="dialog" aria-modal="true" aria-label="技能管理">
			<div className="omp-skill-panel">
				<header className="omp-skill-header">
					<div className="omp-skill-brand">
						<span className="omp-skill-title">技能</span>
						<span className="omp-skill-subtitle">管理 omp 使用的本地与市场技能</span>
					</div>
					<div className="omp-skill-header-tools">
						<div className="omp-skill-search">
							<span>⌕</span>
							<input
								ref={searchRef}
								value={query}
								placeholder="搜索技能（Skillshare 市场）"
								onChange={(event) => {
									setQuery(event.target.value);
									if (event.target.value) setTab("market");
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter") void runSearch(query);
								}}
							/>
						</div>
						<div className="omp-skill-add" ref={addRef}>
							<button
								type="button"
								className="omp-skill-add-btn"
								onClick={() => setAddMenu((v) => !v)}
							>
								+ 添加技能
							</button>
							{addMenu && (
								<div className="omp-skill-menu">
									<button
										type="button"
										onClick={() => {
											setAddMenu(false);
											setTab("market");
											searchRef.current?.focus();
										}}
									>
										查找技能
									</button>
									<button
										type="button"
										onClick={() => {
											setAddMenu(false);
											setShowPublish(true);
										}}
									>
										上传技能
									</button>
									<button
										type="button"
										onClick={() => {
											setAddMenu(false);
											setShowCreate(true);
										}}
									>
										创建技能
									</button>
								</div>
							)}
						</div>
						<button type="button" className="omp-skill-close" onClick={onClose} aria-label="关闭">
							×
						</button>
					</div>
				</header>

				{notice && <div className="omp-skill-notice">{notice}</div>}
				{error && <div className="omp-skill-notice error">{error}</div>}

				<div className="omp-skill-tabs">
					<button
						type="button"
						className={tab === "installed" ? "active" : ""}
						onClick={() => setTab("installed")}
					>
						已安装（{skills.length + disabledNames.length}）
					</button>
					<button
						type="button"
						className={tab === "market" ? "active" : ""}
						onClick={() => setTab("market")}
					>
						技能市场
					</button>
				</div>

				{tab === "installed" ? (
					<div className="omp-skill-content">
						<div className="omp-skill-toolbar">
							<div className="omp-skill-scope-switch" role="group" aria-label="技能范围">
								{(["all", "user", "project"] as const).map((value) => (
									<button
										key={value}
										type="button"
										className={scopeFilter === value ? "active" : ""}
										onClick={() => setScopeFilter(value)}
									>
										{value === "all" ? "全部" : value === "user" ? "用户级" : "项目级"}
									</button>
								))}
							</div>
							<button type="button" className="omp-skill-mini" onClick={() => void loadInstalled()}>
								刷新
							</button>
						</div>
						<p className="omp-skill-hint">
							全局目录 {paths?.userDir ?? "读取中"} · 项目目录 {paths?.projectDir ?? "读取中"}
							<br />
							技能文件为 SKILL.md；项目技能放在工作目录的 .omp/skills 或 .agents/skills 下，由 omp
							自动发现。
						</p>
						{loading ? (
							<div className="omp-skill-empty">正在读取 omp 技能…</div>
						) : (
							<>
								{userSkills.length > 0 && (
									<section className="omp-skill-section">
										<h4>用户级 · 全局（{userSkills.length}）</h4>
										<div className="omp-skill-grid">
											{userSkills.map((skill) => renderInstalledCard(skill))}
										</div>
									</section>
								)}
								{projectSkills.length > 0 && (
									<section className="omp-skill-section">
										<h4>项目级 · 当前工作目录（{projectSkills.length}）</h4>
										<div className="omp-skill-grid">
											{projectSkills.map((skill) => renderInstalledCard(skill))}
										</div>
									</section>
								)}
								{disabledNames.length > 0 && scopeFilter !== "project" && (
									<section className="omp-skill-section">
										<h4>已禁用（{disabledNames.length}）</h4>
										<div className="omp-skill-grid">
											{disabledSkills.map((skill) => renderInstalledCard(skill, false))}
										</div>
									</section>
								)}
								{activeSkills.length === 0 && disabledNames.length === 0 && (
									<div className="omp-skill-empty">
										当前目录没有发现技能。用「添加技能 → 创建技能」新建，或将 SKILL.md 放进
										.omp/skills 目录。
									</div>
								)}
								{warnings.length > 0 && (
									<details className="omp-skill-warnings">
										<summary>omp 发现警告（{warnings.length}）</summary>
										{warnings.map((warning, index) => (
											<p key={index}>{warning}</p>
										))}
									</details>
								)}
							</>
						)}
					</div>
				) : (
					<div className="omp-skill-content">
						<div className="omp-skill-toolbar">
							<div className="omp-skill-scope-switch" role="group" aria-label="排序">
								{(Object.keys(SORT_LABEL) as Sort[]).map((value) => (
									<button
										key={value}
										type="button"
										className={sort === value ? "active" : ""}
										onClick={() => setSort(value)}
									>
										{SORT_LABEL[value]}
									</button>
								))}
							</div>
							<div className="omp-skill-scope-switch" role="group" aria-label="安装范围">
								{(["user", "project"] as SkillScope[]).map((value) => (
									<button
										key={value}
										type="button"
										className={installScope === value ? "active" : ""}
										onClick={() => setInstallScope(value)}
									>
										{value === "user" ? "装到全局" : "装到项目"}
									</button>
								))}
							</div>
						</div>
						{!query.trim() ? (
							<div className="omp-skill-empty">
								输入关键词搜索 Skillshare 技能；结果由 omp 注册表实时返回。
							</div>
						) : searching ? (
							<div className="omp-skill-empty">正在搜索…</div>
						) : hits.length === 0 ? (
							<div className="omp-skill-empty">没有找到匹配的技能。</div>
						) : (
							<>
								<p className="omp-skill-hint">找到 {hits.length} 个技能</p>
								<div className="omp-skill-grid">{hits.map(renderMarketCard)}</div>
							</>
						)}
					</div>
				)}

				{selected && (
					<div className="omp-skill-detail-layer" onClick={() => setSelected(null)}>
						<div className="omp-skill-detail" onClick={(event) => event.stopPropagation()}>
							<div className="omp-skill-detail-head">
								<span className="omp-skill-card-icon">
									{initials(selected.kind === "market" ? selected.hit.name : selected.skill.name)}
								</span>
								<div>
									<h3>
										{selected.kind === "market" ? selected.hit.fullName : selected.skill.name}
									</h3>
									<p>
										{selected.kind === "market"
											? "Skillshare 市场技能"
											: `${selected.skill.source} · ${selected.enabled ? "已启用" : "已禁用"}`}
									</p>
								</div>
								<button type="button" className="omp-skill-close" onClick={() => setSelected(null)}>
									×
								</button>
							</div>
							<p className="omp-skill-detail-desc">
								{selected.kind === "market" ? selected.hit.description : selected.skill.description}
							</p>
							{detailBusy && <p className="omp-skill-hint">正在读取技能详情…</p>}
							{detail && (
								<div className="omp-skill-detail-facts">
									{Object.entries(detail)
										.filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
										.slice(0, 12)
										.map(([key, value]) => (
											<div key={key}>
												<span>{key}</span>
												<strong>{detailText(value)}</strong>
											</div>
										))}
								</div>
							)}
							{selected.kind === "installed" && selected.skill.filePath && (
								<div className="omp-skill-detail-facts">
									<div>
										<span>技能文件</span>
										<strong className="omp-skill-path">{selected.skill.filePath}</strong>
									</div>
								</div>
							)}
							<div className="omp-skill-modal-actions">
								{selected.kind === "market" ? (
									<button
										type="button"
										className="primary"
										onClick={() => {
											void install(selected.hit);
											setSelected(null);
										}}
									>
										安装到{SCOPE_LABEL[installScope]}
									</button>
								) : (
									<>
										{selected.enabled && (
											<button
												type="button"
												className="primary"
												onClick={() => {
													onUseSkill(selected.skill.name);
													setSelected(null);
												}}
											>
												在会话中使用
											</button>
										)}
										<button
											type="button"
											onClick={() => {
												void toggleSkill(selected.skill, !selected.enabled);
											}}
										>
											{selected.enabled ? "禁用" : "启用"}
										</button>
									</>
								)}
							</div>
						</div>
					</div>
				)}

				{showCreate && (
					<div className="omp-skill-detail-layer" onClick={() => setShowCreate(false)}>
						<div className="omp-skill-detail" onClick={(event) => event.stopPropagation()}>
							<h3>创建技能</h3>
							<p className="omp-skill-hint">omp 会在对应目录生成 SKILL.md，内容由你继续编辑。</p>
							<label className="omp-skill-field">
								<span>技能名</span>
								<input
									value={newName}
									placeholder="例如 my-review-skill"
									onChange={(event) => setNewName(event.target.value)}
								/>
							</label>
							<label className="omp-skill-field">
								<span>描述（omp 必需，用于模型发现技能）</span>
								<input
									value={newDescription}
									placeholder="这个技能解决什么问题、什么时候使用"
									onChange={(event) => setNewDescription(event.target.value)}
								/>
							</label>
							<div className="omp-skill-scope-switch" role="group" aria-label="创建位置">
								{(["user", "project"] as SkillScope[]).map((value) => (
									<button
										key={value}
										type="button"
										className={newScope === value ? "active" : ""}
										onClick={() => setNewScope(value)}
									>
										{SCOPE_LABEL[value]}
									</button>
								))}
							</div>
							<div className="omp-skill-modal-actions">
								<button type="button" onClick={() => setShowCreate(false)}>
									取消
								</button>
								<button type="button" className="primary" onClick={() => void create()}>
									创建
								</button>
							</div>
						</div>
					</div>
				)}

				{showPublish && (
					<div className="omp-skill-detail-layer" onClick={() => setShowPublish(false)}>
						<div className="omp-skill-detail" onClick={(event) => event.stopPropagation()}>
							<h3>上传技能到 Skillshare</h3>
							<p className="omp-skill-hint">
								由 omp 的 publish 命令执行，需要本机已登录 Stencil 凭证（或 SKILLS_TOKEN
								环境变量）。
							</p>
							<label className="omp-skill-field">
								<span>技能目录（含 SKILL.md）</span>
								<input
									value={publishDir}
									placeholder="例如 C:\Users\admin\.omp\agent\skills\my-skill"
									onChange={(event) => setPublishDir(event.target.value)}
								/>
							</label>
							<label className="omp-skill-field">
								<span>发布 scope（用户名）</span>
								<input
									value={publishScope}
									placeholder="你的 Skillshare 用户名"
									onChange={(event) => setPublishScope(event.target.value)}
								/>
							</label>
							<div className="omp-skill-modal-actions">
								<button type="button" onClick={() => setShowPublish(false)}>
									取消
								</button>
								<button type="button" className="primary" onClick={() => void publish()}>
									发布
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
