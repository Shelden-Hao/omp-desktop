/**
 * 文件预览：标签页 + 只读代码块。当前文件来自本地或对话里的代码块，
 * 内容读写在主进程完成，这里只展示。
 */

import type { DocFile } from "../../core/docs";
import { CodeBlock } from "../chat/CodeBlock";
import { Icon } from "../common/Icon";

interface PreviewPaneProps {
	docs: DocFile[];
	currentDoc?: DocFile;
	activeDoc: string | null;
	onSelectDoc(key: string): void;
	onCloseDoc(key: string): void;
	onReload(): void;
	onOpenFile(): void;
	onClose(): void;
}

export function PreviewPane({
	docs,
	currentDoc,
	activeDoc,
	onSelectDoc,
	onCloseDoc,
	onReload,
	onOpenFile,
	onClose,
}: PreviewPaneProps) {
	return (
		<aside className="omp-preview">
			<div className="omp-preview-head">
				<div>
					<Icon name="file" size={14} />
					<span>文件预览</span>
					{currentDoc && (
						<span className="omp-preview-current" title={currentDoc.path || currentDoc.name}>
							· {currentDoc.name}
						</span>
					)}
				</div>
				<div className="omp-preview-actions">
					<button
						type="button"
						className="omp-icon-button"
						onClick={onOpenFile}
						title="打开文件"
						aria-label="打开文件"
					>
						<Icon name="folder" size={14} />
					</button>
					{currentDoc?.path && (
						<button
							type="button"
							className="omp-icon-button"
							onClick={onReload}
							title="重新读取文件"
							aria-label="重新读取文件"
						>
							<Icon name="refresh" size={14} />
						</button>
					)}
					<button
						type="button"
						className="omp-icon-button"
						onClick={onClose}
						title="关闭预览"
						aria-label="关闭预览"
					>
						<Icon name="close" size={14} />
					</button>
				</div>
			</div>
			<div className="omp-file-tabs">
				{docs.map((doc) => (
					<div key={doc.key} className={`omp-file-tab ${activeDoc === doc.key ? "active" : ""}`}>
						<button type="button" onClick={() => onSelectDoc(doc.key)} title={doc.path || doc.name}>
							<Icon name="file" size={12} />
							<span>{doc.name}</span>
						</button>
						<button
							type="button"
							className="omp-tab-close"
							onClick={() => onCloseDoc(doc.key)}
							title="关闭"
							aria-label={`关闭 ${doc.name}`}
						>
							<Icon name="close" size={11} />
						</button>
					</div>
				))}
			</div>
			<div className="omp-preview-body">
				{currentDoc ? (
					<CodeBlock code={currentDoc.content} lang={currentDoc.language} />
				) : (
					<div className="omp-preview-empty">
						<Icon name="file" size={24} />
						<p>暂无预览文件</p>
						<span>打开文件，或在回复中打开代码块</span>
						<button type="button" className="omp-preview-open" onClick={onOpenFile}>
							<Icon name="folder" size={13} />
							选择文件
						</button>
					</div>
				)}
			</div>
		</aside>
	);
}
