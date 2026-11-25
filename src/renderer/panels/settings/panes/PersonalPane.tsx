import type { ReplyStyle } from "../../../../shared/types";
import { Row, Toggle } from "../controls";
import { REPLY_STYLE_LABEL } from "../labels";
import type { PaneProps } from "../types";

export function PersonalPane({ draft, patch }: PaneProps) {
	return (
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
					<Toggle checked={false} disabled label="对话后续推荐" onChange={() => undefined} />
				</Row>
				<div className="omp-set-row omp-set-row-stack">
					<div className="omp-set-row-text">
						<div className="omp-set-row-title">
							给 omp 的指令
							<span className="omp-set-inline-tag">新建对话生效</span>
						</div>
						<p className="omp-set-row-desc">写下你希望 omp 一直遵守的要求，会追加到系统提示里。</p>
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
	);
}
