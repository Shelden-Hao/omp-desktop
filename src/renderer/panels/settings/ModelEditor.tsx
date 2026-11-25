import { useState } from "react";
import type { CustomModelEntry, ModelInputData } from "../../../shared/types";
import { cleanError } from "./util";

export function ModelEditor({
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
