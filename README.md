# OMP Desktop

[omp](https://github.com/can1357/oh-my-pi) 的桌面外壳，通过 **Agent Client Protocol (ACP)** 驱动同一个编码代理。

omp 本身是命令行工具。本项目只负责给它套一层图形界面：会话列表、消息流、工具调用卡片、权限确认、文件预览与主题切换。界面不修改 omp 内核，也不假装拥有 omp 没有的能力。

## 设计原则

- 只呈现 omp / ACP 已提供的能力：会话、prompt、工具调用、权限请求、文件与终端回调。
- 没有后端实现的入口不做；界面上的按钮都对应真实动作。
- 主题只有浅色、深色、跟随系统三档，跟随系统时监听系统主题变化。
- 本地化、简洁、留白充足，避免把命令行能力包装成不存在的“平台功能”。

## 架构

四个进程边界，一条单向依赖链。每一层只认识它下面那层，谁都不跨层反向引用。

```
shared/      契约层：类型、常量、IPC 通道名。无 Electron、无 React、无副作用
   ↑            ↑                ↑
main/        preload/         renderer/
Node 能力     contextBridge    React 界面
```

`main` 与 `renderer` 之间没有任何直接 import，只共享 `shared` 里声明的类型；跨进程通信一律走 `preload` 暴露的 `window.desktop`。这样渲染层永远拿不到 Node 能力，主进程也不会去关心界面长什么样。

### 目录职责

```
src/
├── shared/                     # 主进程/预加载/渲染层共同遵守的契约
│   ├── types/                  # 按领域切的纯类型：settings/session/skills/models/security/files
│   ├── bridge.ts               # DesktopBridge：IPC 的对外接口定义
│   └── protocol.ts             # ACP JSON-RPC 帧与事件类型
│
├── main/                       # Electron 主进程：系统能力与业务编排
│   ├── index.ts                # 入口，只做装配（注册 IPC、建窗口、起 agent）
│   ├── bootstrap/              # 窗口创建与 app 生命周期
│   ├── ipc/                    # 一域一文件，只做通道注册与参数收口
│   ├── services/               # 业务编排：不碰 ipcMain，不碰 BrowserWindow
│   └── platform/               # Electron/OS 薄封装：电源、代理、登录项、shell、路径
│
├── preload/                    # 唯一的跨进程出口，只转发、不含业务逻辑
│
└── renderer/                   # React 渲染层
    ├── App.tsx                 # 组合根：装配状态与布局，不放解析/格式化逻辑
    ├── core/                   # 与 React 无关的纯逻辑，可单测
    ├── panels/                 # 整块业务面板（容器）：自己取数据、自己管状态
    ├── components/             # 纯展示组件，按界面区域分组
    └── styles/                 # 按域拆分的样式与设计变量
```

### 主进程内部分层

```
bootstrap  →  ipc  →  services  →  platform
（生命周期）（通道）  （业务）      （系统调用）
```

- `ipc/*`：只做 `ipcMain.handle` 注册、参数收口、错误转结构化返回；不许写业务分支。
- `services/*`：可被 IPC 和后台任务（如自动更新技能）共用；不许 import `electron` 的窗口/通道 API。
- `platform/*`：`powerSaveBlocker`、`session.setProxy`、`app.setLoginItemSettings` 这类调用集中在这里，换平台时只改这一层。
- 依赖只能向右流动，`platform` 不许反向 import `services`。

### 渲染层内部分层

```
App.tsx  →  components/*  →  core/*
（装配）     （展示）        （纯逻辑）
```

- `core/*`：Markdown 解析、时间/容量格式化、敏感信息检测、`/context` 解析、contenteditable 编辑器操作。全部是无状态函数或纯类，不 import React。
- `components/*`：接收 props 渲染，自己不发 IPC、不读全局设置；需要数据的从上层传入。
- `App.tsx`：只保留跨区域状态（会话、连接、当前任务）与布局；单个面板的内部状态放在该面板里。

### 一次改动的落位判断

1. 是主进程与界面都要用的类型？→ `shared/types/`。
2. 是系统 API（电源、代理、注册表、文件对话框）？→ `main/platform/`。
3. 是业务流程（保存设置要同时写本地与 omp 配置）？→ `main/services/`。
4. 是纯计算（解析、格式化、校验）？→ `renderer/core/`。
5. 是一块界面的像素？→ `renderer/components/<区域>/`。
6. 只有到这一步还放不下，才写进 `App.tsx`。

### 协议

握手直接使用 JSON-RPC 2.0 over NDJSON，不依赖 ACP SDK 的版本 API，omp 升级时外壳不易被破坏。主进程只做字节流搬运与帧切分，协议状态机在 `renderer/core/acp/client.ts`。

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
- [x] ACP fs 读写回调（限制在工作目录内）
- [x] ACP terminal 回调（进程、输出、退出、终止）
- [x] 会话列表持久化与 ACP 会话恢复
- [x] 运行中取消与权限请求取消
- [ ] Windows 安装包打包

## License

MIT
