import type { CustomModelEntry, CustomModelState, OmpConfigData } from "../../../../shared/types";
import { Row } from "../controls";
import { SetIcon } from "../SetIcon";
import type { PaneProps } from "../types";
import { probeModel } from "../util";

interface ModelsPaneProps extends PaneProps {
	models: CustomModelState | null;
	ompConfig: OmpConfigData | null;
	onAddModel(): void;
	onEditModel(model: CustomModelEntry): void;
	onRemoveModel(model: CustomModelEntry): void;
	onRefreshModels(): void;
	reloadOmpConfig(): void;
}

export function ModelsPane({
	models,
	ompConfig,
	onAddModel,
	onEditModel,
	onRemoveModel,
	onRefreshModels,
	reloadOmpConfig,
	setError,
	notify,
}: ModelsPaneProps) {
	const list = models?.models ?? [];

	return (
		<section id="omp-settings-models" className="omp-settings-section">
			<div className="omp-settings-card">
				<div className="omp-set-card-head">
					<div>
						<div className="omp-set-row-title">自定义模型</div>
						<p className="omp-set-row-desc">
							写入 omp 的 models.yml（{models?.path ?? "读取中…"}），仅支持 OpenAI 兼容接口。
						</p>
					</div>
					<button type="button" className="omp-set-primary" onClick={onAddModel}>
						添加模型
					</button>
				</div>
				<div className="omp-set-model-list">
					{list.map((model) => (
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
									onClick={() => onEditModel(model)}
								>
									<SetIcon name="pencil" size={14} />
								</button>
								<button
									type="button"
									title="测试连接"
									aria-label="测试连接"
									onClick={async () => {
										const probe = await probeModel(model, model.apiKey);
										notify(probe.ok ? "连接成功" : `连接失败：${probe.message.slice(0, 80)}`);
									}}
								>
									<SetIcon name="plug" size={14} />
								</button>
								<button
									type="button"
									title="删除"
									aria-label="删除模型"
									onClick={() => onRemoveModel(model)}
								>
									<SetIcon name="trash" size={14} />
								</button>
							</div>
						</div>
					))}
					{models && list.length === 0 && (
						<p className="omp-set-empty">还没有自定义模型，点右上角添加。</p>
					)}
				</div>
			</div>
			<div className="omp-settings-card">
				<Row title="辅助任务模型" desc="用于标题生成、摘要等轻量任务，不影响主对话所用模型。">
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
								notify("辅助模型已更新，新建对话生效");
								reloadOmpConfig();
							}
						}}
					>
						<option value="">默认（跟随主模型）</option>
						{list.map((model) => (
							<option key={`${model.provider}/${model.id}`} value={`${model.provider}/${model.id}`}>
								{model.name || `${model.provider}/${model.id}`}
							</option>
						))}
					</select>
				</Row>
				<div className="omp-set-inline-action">
					<button type="button" onClick={onRefreshModels}>
						重新读取模型配置
					</button>
					<span>改动 models.yml 后需要重启应用才能在主界面选择新模型</span>
				</div>
			</div>
		</section>
	);
}
