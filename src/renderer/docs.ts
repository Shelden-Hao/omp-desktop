/** 右侧文档预览面板的默认文档内容。后续可由文件卡片点击动态载入。 */
export interface DocFile {
	name: string;
	content: string;
	language?: string;
}

export const DEFAULT_DOCS: DocFile[] = [
	{
		name: "README.md",
		language: "markdown",
		content: `# OMP Desktop

A WorkBuddy-style desktop GUI for omp (oh-my-pi) coding agent, built on the Agent Client Protocol.

omp 本身是纯命令行工具。本项目给它套一个图形工作台：左侧会话列表、中间消息流与工具卡片、底部输入框、权限确认弹窗——外观 100% 可控，且不修改 omp 内核。

## 架构

Electron Main 负责 spawn omp acp 并做 NDJSON 帧桥接；React Renderer 用手写的 JSON-RPC 客户端对接 ACP，界面为 WorkBuddy 风格三栏布局。

## 前置条件

- Node.js 22+
- Bun 1.4.4+
- omp: bun add -g @oh-my-pi/pi-coding-agent

## 启动

\`\`\`bash
cd D:/CodeField/omp-desktop
npm run build
npm start
\`\`\`

注意：启动时需清除 ELECTRON_RUN_AS_NODE 环境变量。
`,
	},
	{
		name: "acp-client.ts",
		language: "typescript",
		content: `export class AcpClient {
  private nextId = 1;
  private pending = new Map<number, Pending>();

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const line = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.bridge.agent.send(line);
    });
  }

  async initialize() {
    return this.request("initialize", {
      protocolVersion: 1,
      clientInfo: { name: "omp-desktop", version: "0.1.0" },
      clientCapabilities: { fs: { readTextFile: true }, terminal: true },
    });
  }
}
`,
	},
];
