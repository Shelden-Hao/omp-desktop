# OMP Desktop

[omp](https://github.com/can1357/oh-my-pi) 的桌面外壳，通过 **Agent Client Protocol (ACP)** 驱动同一个编码代理。

omp 本身是命令行工具。本项目只负责给它套一层图形界面：会话列表、消息流、工具调用卡片、权限确认、文件预览与主题切换。界面不修改 omp 内核，也不假装拥有 omp 没有的能力。

## 设计原则

- 只呈现 omp / ACP 已提供的能力：会话、prompt、工具调用、权限请求、文件与终端回调。
- 没有后端实现的入口不做；界面上的按钮都对应真实动作。
- 主题只有浅色、深色、跟随系统三档，跟随系统时监听系统主题变化。
- 本地化、简洁、留白充足，避免把命令行能力包装成不存在的“平台功能”。

## 架构

```
Electron Main (src/main)
  - spawn: bun <omp-cli> acp
  - NDJSON 帧桥接 stdin/stdout
  - 设置与主题持久化
           |
           | IPC (contextBridge)
           v
React Renderer (src/renderer)
  - AcpClient: JSON-RPC 2.0 状态机
  - 三栏工作台：会话 / 对话 / 文件预览
  - 工具卡片 / 权限确认 / 思考过程
```

握手直接使用 JSON-RPC 2.0 over NDJSON，不依赖 ACP SDK 的版本 API，omp 升级时外壳不易被破坏。

## 前置条件

- Node.js ≥ 22
- [Bun](https://bun.sh) ≥ 1.4.4
- omp 已安装：`bun add -g @oh-my-pi/pi-coding-agent`

启动时会自动探测 bun 与 omp CLI；找不到时在右上角设置中手动指定。

## 开发

```bash
npm install
npm run build
npm start
```

开发模式（Vite 热更新）：

```bash
npm run dev
VITE_DEV_URL=http://localhost:5178 npm start
```

在 Windows 的某些终端里需要先清除 `ELECTRON_RUN_AS_NODE`：

```bash
env -u ELECTRON_RUN_AS_NODE npm start
```

## 配置

设置保存在 `%APPDATA%/omp-desktop/settings.json`：

```json
{
  "ompCliPath": "C:/Users/<you>/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/dist/cli.js",
  "bunPath": "C:/Users/<you>/.../node_modules/bun/bin/bun.exe",
  "cwd": "C:/Users/<you>/Desktop",
  "theme": "system"
}
```

- `cwd`：omp 的工作目录。
- `theme`：`light`、`dark` 或 `system`。

## 状态

- [x] Electron 主进程 + NDJSON 帧桥接
- [x] ACP 握手 / 新建会话 / prompt 发送 / 取消
- [x] 浅色 / 深色 / 跟随系统三档主题
- [x] 工具调用卡片 / 权限确认 / 思考过程展示
- [x] 本地文件预览与文件引用
- [ ] ACP fs 读写回调
- [ ] ACP terminal 回调
- [ ] 会话历史持久化与恢复
- [ ] Windows 安装包打包

## License

MIT
