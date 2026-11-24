/** 预览面板中的文档由用户主动打开，默认不放置示例内容。 */
export interface DocFile {
	key: string;
	name: string;
	content: string;
	language?: string;
	path?: string;
}

export const DEFAULT_DOCS: DocFile[] = [];
