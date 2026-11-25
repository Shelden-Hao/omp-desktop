/** 创建与上传技能的对话框：表单状态留在本地，提交结果由调用方的 Promise 决定 */
import { useState } from "react";
import type { SkillScope } from "../../../shared/types";
import { SCOPE_LABEL } from "./labels";

interface CreateSkillDialogProps {
	onCancel(): void;
	onSubmit(input: { name: string; description: string; scope: SkillScope }): Promise<boolean>;
}

export function CreateSkillDialog({ onCancel, onSubmit }: CreateSkillDialogProps) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [scope, setScope] = useState<SkillScope>("user");
	const [busy, setBusy] = useState(false);
	const [localError, setLocalError] = useState("");

	const submit = async () => {
		if (!name.trim() || !description.trim()) {
			setLocalError("请填写技能名和描述");
			return;
		}
		setLocalError("");
		setBusy(true);
		const ok = await onSubmit({
			name: name.trim(),
			description: description.trim(),
			scope,
		});
		setBusy(false);
		if (ok) onCancel();
	};

	return (
		<div className="omp-skill-detail-layer" onClick={onCancel}>
			<div className="omp-skill-detail" onClick={(event) => event.stopPropagation()}>
				<h3>创建技能</h3>
				<p className="omp-skill-hint">omp 会在对应目录生成 SKILL.md，内容由你继续编辑。</p>
				<label className="omp-skill-field">
					<span>技能名</span>
					<input
						value={name}
						placeholder="例如 my-review-skill"
						onChange={(e) => setName(e.target.value)}
					/>
				</label>
				<label className="omp-skill-field">
					<span>描述（omp 必需，用于模型发现技能）</span>
					<input
						value={description}
						placeholder="这个技能解决什么问题、什么时候使用"
						onChange={(e) => setDescription(e.target.value)}
					/>
				</label>
				<div className="omp-skill-scope-switch" role="group" aria-label="创建位置">
					{(["user", "project"] as SkillScope[]).map((value) => (
						<button
							key={value}
							type="button"
							className={scope === value ? "active" : ""}
							onClick={() => setScope(value)}
						>
							{SCOPE_LABEL[value]}
						</button>
					))}
				</div>
				{localError && <p className="omp-skill-hint">{localError}</p>}
				<div className="omp-skill-modal-actions">
					<button type="button" onClick={onCancel}>
						取消
					</button>
					<button type="button" className="primary" disabled={busy} onClick={() => void submit()}>
						{busy ? "创建中" : "创建"}
					</button>
				</div>
			</div>
		</div>
	);
}

interface PublishSkillDialogProps {
	onCancel(): void;
	onSubmit(dir: string, scope: string): Promise<boolean>;
}

export function PublishSkillDialog({ onCancel, onSubmit }: PublishSkillDialogProps) {
	const [dir, setDir] = useState("");
	const [scope, setScope] = useState("");
	const [busy, setBusy] = useState(false);

	const submit = async () => {
		setBusy(true);
		const ok = await onSubmit(dir.trim(), scope.trim());
		setBusy(false);
		if (ok) onCancel();
	};

	return (
		<div className="omp-skill-detail-layer" onClick={onCancel}>
			<div className="omp-skill-detail" onClick={(event) => event.stopPropagation()}>
				<h3>上传技能到 Skillshare</h3>
				<p className="omp-skill-hint">
					由 omp 的 publish 命令执行，需要本机已登录 Stencil 凭证（或 SKILLS_TOKEN 环境变量）。
				</p>
				<label className="omp-skill-field">
					<span>技能目录（含 SKILL.md）</span>
					<input
						value={dir}
						placeholder="例如 C:\Users\admin\.omp\agent\skills\my-skill"
						onChange={(e) => setDir(e.target.value)}
					/>
				</label>
				<label className="omp-skill-field">
					<span>发布 scope（用户名）</span>
					<input
						value={scope}
						placeholder="你的 Skillshare 用户名"
						onChange={(e) => setScope(e.target.value)}
					/>
				</label>
				<div className="omp-skill-modal-actions">
					<button type="button" onClick={onCancel}>
						取消
					</button>
					<button type="button" className="primary" disabled={busy} onClick={() => void submit()}>
						{busy ? "发布中" : "发布"}
					</button>
				</div>
			</div>
		</div>
	);
}
