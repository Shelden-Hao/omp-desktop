/**
 * 输入区外壳：联想菜单、contenteditable 输入框、底栏工具条与模型面板。
 *
 * 外壳不持有业务状态：菜单元数据、当前模式、模型列表都由 App 传进来，
 * 输入框是 DOM 引用 + 一组事件回调，正文读写走 core/composer/editor。
 */

import type {
	FormEvent as ReactFormEvent,
	KeyboardEvent as ReactKeyboardEvent,
	MouseEvent as ReactMouseEvent,
	RefObject,
} from "react";
import { Icon } from "../common/Icon";
import { ApprovalMenu, type ApprovalMenuProps } from "./ApprovalMenu";
import { ContextPanel, type ContextPanelProps } from "./ContextPanel";
import { EntryMenu, type EntryMenuProps } from "./EntryMenu";
import { ModelPanel, type ModelPanelProps } from "./ModelPanel";
import { SuggestMenu, type SuggestMenuProps } from "./SuggestMenu";
import { WorkspaceMenu, type WorkspaceMenuProps } from "./WorkspaceMenu";

/** 输入框事件全部由 App 提供，因为读写 chip 依赖 App 里的草稿状态 */
interface EditorHandlers {
	onInput(): void;
	onBeforeInput(event: ReactFormEvent<HTMLDivElement>): void;
	onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void;
	onMouseDown(event: ReactMouseEvent<HTMLDivElement>): void;
	onCompositionStart(): void;
	onCompositionEnd(): void;
	onBlur(): void;
}

interface ComposerProps {
	connected: boolean;
	running: boolean;
	/** 发送按钮是否置灰（未连接或输入为空） */
	sendDisabled: boolean;
	editorRef: RefObject<HTMLDivElement | null>;
	editorHandlers: EditorHandlers;
	resourceSuggest: { open: boolean; menu: SuggestMenuProps };
	skillSuggest: { open: boolean; menu: SuggestMenuProps };
	entryMenu: EntryMenuProps;
	/** 工作目录选择：不选就是默认目录 */
	workspace: WorkspaceMenuProps;
	approval: ApprovalMenuProps;
	context: ContextPanelProps;
	modelTrigger: { name?: string; open: boolean; onToggle(): void };
	modelPanel: ModelPanelProps;
	onSend(): void;
	onCancel(): void;
}

export function Composer({
	connected,
	running,
	sendDisabled,
	editorRef,
	editorHandlers,
	resourceSuggest,
	skillSuggest,
	entryMenu,
	workspace,
	approval,
	context,
	modelTrigger,
	modelPanel,
	onSend,
	onCancel,
}: ComposerProps) {
	return (
		<div className="omp-composer-wrap">
			<div className="omp-composer">
				{resourceSuggest.open && <SuggestMenu {...resourceSuggest.menu} />}
				{skillSuggest.open && <SuggestMenu {...skillSuggest.menu} />}
				<div
					ref={editorRef}
					className="omp-composer-input"
					contentEditable={connected && !running}
					suppressContentEditableWarning
					role="textbox"
					aria-multiline="true"
					aria-label="任务输入框"
					data-placeholder={connected ? "描述任务，按 Enter 发送" : "等待连接 omp…"}
					onInput={editorHandlers.onInput}
					onBeforeInput={editorHandlers.onBeforeInput}
					onKeyDown={editorHandlers.onKeyDown}
					onMouseDown={editorHandlers.onMouseDown}
					onCompositionStart={editorHandlers.onCompositionStart}
					onCompositionEnd={editorHandlers.onCompositionEnd}
					onBlur={editorHandlers.onBlur}
				/>
				<div className="omp-composer-footer">
					<div className="omp-composer-hint">
						<EntryMenu {...entryMenu} />
						<WorkspaceMenu {...workspace} />
					</div>
					<div className="omp-composer-tools">
						<ApprovalMenu {...approval} />
						<div className="omp-model-wrap">
							<button
								type="button"
								className={`omp-model-trigger ${modelTrigger.open ? "active" : ""}`}
								onClick={modelTrigger.onToggle}
								title="模型与推理档位"
								aria-label="模型与推理档位"
								aria-haspopup="dialog"
								aria-expanded={modelTrigger.open}
							>
								<Icon name="spark" size={13} />
								<span className="omp-model-label">{modelTrigger.name || "模型"}</span>
								<Icon name="chevron" size={12} />
							</button>
							<ModelPanel {...modelPanel} />
						</div>
						<ContextPanel {...context} />
						{running ? (
							<button
								type="button"
								className="omp-send stop"
								onClick={onCancel}
								title="停止当前任务"
							>
								<Icon name="stop" size={13} />
								<span className="omp-btn-label">停止</span>
							</button>
						) : (
							<button
								type="button"
								className="omp-send"
								onClick={onSend}
								disabled={sendDisabled}
								title="发送"
							>
								<Icon name="send" size={13} />
								<span className="omp-btn-label">发送</span>
							</button>
						)}
					</div>
				</div>
			</div>
			<div className="omp-disclaimer">内容由 AI 生成，请核对重要信息</div>
		</div>
	);
}
