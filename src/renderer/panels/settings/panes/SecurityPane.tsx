import {
	POLICY_TOOLS,
	type ApprovalMode,
	type AuditEntry,
	type PolicyTool,
	type RuntimeInfo,
	type ToolPolicy,
} from "../../../../shared/types";
import { Row, Toggle } from "../controls";
import { APPROVAL_LABEL, POLICY_LABEL, POLICY_TOOL_LABEL } from "../labels";
import type { PaneProps } from "../types";
import { formatTime } from "../util";

interface SecurityPaneProps extends PaneProps {
	runtimes: RuntimeInfo[];
	audit: AuditEntry[];
	/** 清空审计记录：由外层弹二次确认后执行 */
	onClearAudit(): void;
}

export function SecurityPane({
	draft,
	patch,
	notify,
	runtimes,
	audit,
	onClearAudit,
}: SecurityPaneProps) {
	const setToolPolicy = (tool: PolicyTool, value: ToolPolicy | "follow") => {
		const next = { ...draft.toolPolicies };
		if (value === "follow") delete next[tool];
		else next[tool] = value;
		patch({ toolPolicies: next });
	};

	const addRestrictedFolder = async () => {
		const dir = await window.desktop.system.pickDirectory();
		if (!dir) return;
		if (draft.restrictedFolders.includes(dir)) return;
		patch({ restrictedFolders: [...draft.restrictedFolders, dir] });
	};

	return (
		<section id="omp-settings-security" className="omp-settings-section">
			<h4>AI 安全防护</h4>
			<div className="omp-settings-card">
				<Row
					title="模型行为智能审查"
					desc="对应 omp 的审批档位：档位越严，工具调用前越需要你确认。"
				>
					<select
						value={draft.approvalMode}
						onChange={(event) => patch({ approvalMode: event.target.value as ApprovalMode })}
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
					<Toggle checked={false} disabled label="工具内容注入防护" onChange={() => undefined} />
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
											restrictedFolders: draft.restrictedFolders.filter((item) => item !== folder),
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
						<p className="omp-set-row-desc">写入 omp 的 tools.approval，优先级高于审批档位。</p>
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
				<Row title="敏感保护" desc="发送前检测 API Key、密码、私钥等疑似敏感内容并拦截确认。">
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
								notify(result.ok ? `已导出到 ${result.path}` : "已取消导出");
							}}
						>
							导出日志
						</button>
						<button type="button" onClick={onClearAudit}>
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
	);
}
