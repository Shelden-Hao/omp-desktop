import type { OmpConfigData } from "../../../../shared/types";
import { Row, Toggle } from "../controls";
import type { PaneProps } from "../types";

interface MemoryPaneProps extends PaneProps {
	ompConfig: OmpConfigData | null;
	updating: boolean;
	onUpdateSkills(): void;
}

export function MemoryPane({ draft, patch, ompConfig, updating, onUpdateSkills }: MemoryPaneProps) {
	return (
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
					<button type="button" onClick={onUpdateSkills} disabled={updating}>
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
	);
}
