# OMP Desktop

A WorkBuddy-style desktop GUI for [omp](https://github.com/can1357/oh-my-pi) (oh-my-pi) coding agent, built on the **Agent Client Protocol (ACP)**.

omp 本身是纯命令行工具。本项目给它套一个图形工作台：左侧会话列表、中间消息流与工具卡片、底部输入框、权限确认弹窗——外观 100% 可控，且不修改 omp 内核。

## 架构

```
┌─────────────────────────────────────────┐
│  Electron Main (src/main)               │
│   - spawn: bun <omp-cli> acp             │
│   - NDJSON 帧桥接 stdin/stdout           │
│   - 设置持久化 (settings.json)           │
└───────────────┬─────────────────────────┘
                │ IPC (contextBridge)
┌───────────────▼─────────────────────────┐
│  React Renderer (src/renderer)          │
│   - AcpClient: JSON-RPC 2.0 状态机       │
│   - WorkBuddy 风格三栏界面               │
│   - 工具卡片 / 权限确认 / 思考过程        │
└─────────────────────────────────────────┘
```

直接用 JSON-RPC 2.0 over NDJSON 对接，不依赖 ACP SDK 的版本 API，omp 升级不易破坏外壳。

## 前置条件

- Node.js ≥ 22
- [Bun](https://bun.sh) ≥ 1.4.4
- omp 已安装：`bun add -g @oh-my-pi/pi-coding-agent`

默认会自动探测 bun 与 omp CLI 的路径；找不到时在界面右上角 `⚙ 设置` 里手动指定。

## 开发

```bash
bun install          # 或 npm install --legacy-peer-deps
npm run build        # 编译主进程 + 构建渲染进程
npm start            # 启动 Electron
```

开发模式（Vite 热更新）：

```bash
npm run dev          # 终端 1：启动 Vite dev server (5178)
VITE_DEV_URL=http://localhost:5178 npm start   # 终端 2：Electron 加载 dev URL
```

## 配置

设置存于 `%APPDATA%/omp-desktop/settings.json`：

```json
{
  "ompCliPath": "C:/Users/<you>/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/dist/cli.js",
  "bunPath": "C:/Users/<you>/.../node_modules/bun/bin/bun.exe",
  "cwd": "C:/Users/<you>/Desktop",
  "theme": "dark"
}
```

`cwd` 是 omp 的工作目录（项目根目录）。

## 状态

- [x] Electron 主进程 + NDJSON 帧桥接
- [x] ACP 握手 / 会话新建 / prompt 发送
- [x] WorkBuddy 风格三栏界面 + 明暗主题
- [x] 工具调用卡片 / 权限确认弹窗 / 思考过程展示
- [ ] fs / terminal 工具回调的真实实现（当前为占位响应）
- [ ] KCoder 自定义模型配进 omp
- [ ] 会话历史持久化与恢复
- [ ] Windows 安装包打包

## License

MIT
