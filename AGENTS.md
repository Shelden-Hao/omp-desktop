# AGENTS.md

本文件是 AI 编码助手在本仓库工作时的规约。开始改动前先完整阅读本文件。

## 项目定位

`omp-desktop` 是 omp（oh-my-pi）coding agent 的**桌面外壳**：一个 Electron 应用，通过 **ACP（Agent Client Protocol）** 与本地 omp 进程通信，提供图形界面。它不是 agent 本身，不重新实现 agent 逻辑。

核心原则：**外壳只呈现 omp/ACP 真实具备的能力，不硬造没有后端支撑的功能。**

## 架构与目录

```
src/
  main/index.ts        Electron 主进程：窗口、设置持久化、spawn omp acp、ACP 子进程桥接、文件与终端回调
  preload/index.ts     contextBridge 安全桥：向渲染进程暴露受控的 desktop API
  renderer/
    main.tsx           React 入口
    App.tsx            界面与交互主体（会话、消息、侧栏、输入区、主题）
    acp-client.ts      手写 ACP JSON-RPC 2.0 客户端（NDJSON，request/response/notification）
    docs.ts            右侧文件预览的数据源与辅助
    styles.css         全部样式，使用 CSS 变量（--surface-* / --text-* / --accent-* 等）
```

数据流：渲染进程 → `window.desktop.agent.send(line)` → 主进程写入 omp stdin；omp stdout 的 NDJSON 帧 → 主进程 → 渲染进程 `handleEvent` 分发。权限请求、文件读写、终端命令由主进程通过 IPC 响应。

## 命令

```bash
npm run dev            # 启动 Vite 开发服务器（仅渲染层）
npm run build          # 全量构建：主进程 tsc + 渲染层 vite
npm start              # 启动 Electron 应用（需先 build）
npm run lint           # oxlint 检查 src/
npm run lint:fix       # oxlint 自动修复
npm run format         # oxfmt 格式化 src/
npm run format:check   # 格式检查
npm run check          # lint + format:check + build，提交前必跑
npm run dist:win       # 打包 Windows 安装包
```

代码改动后必须执行 `npm run check`，全部通过再提交。

Windows 上启动 Electron 前需清除宿主环境注入的 `ELECTRON_RUN_AS_NODE`：`env -u ELECTRON_RUN_AS_NODE npm start`（Git Bash）。

## 代码风格

- 格式化由 **oxfmt** 负责（`.oxfmtrc.json`）：TS/TSX 用 tab 缩进，CSS/JSON/MD 用 2 空格，双引号，分号，行宽 100，LF 换行。不要手工调整格式，交给 `npm run format`。
- Lint 由 **oxlint** 负责（`.oxlintrc.json`）：correctness 为 error，suspicious 为 warn。避免 `any`；能用类型表达就不要写运行时校验。
- 渲染层用函数组件与 hooks，副作用放 `useEffect`，避免在渲染中做 IPC 调用。
- 样式优先用 CSS 变量与语义类名（`omp-*` 前缀），颜色/间距/圆角不要写魔法值。
- 主题只支持浅色、深色、跟随系统三档，通过 `data-theme` 切换；不要引入第四种主题。

## 能力边界（重要）

参考界面时只借鉴布局与视觉，**不要**在代码中出现任何其他产品的品牌字样。

只实现 omp/ACP 确实支持的能力：会话（新建/切换/恢复/取消）、消息与工具调用、文件读写回调、终端回调、模型与推理档位切换（`session/set_mode`、`session/set_config_option`）、本地文件预览。

**不实现**没有后端支撑的功能：账号登录、套餐/积分、云端助理、定时任务、资料库、发现/分享/点赞等。遇到这类需求，先确认 omp 是否有对应能力，没有就明确拒绝。

模型与档位一律从 ACP 的 `configOptions` / `modes` 动态读取，禁止硬编码模型名。

## Git 规范

- **每完成一个小任务、小功能或小 bug 修复，单独一次 commit + push**，不要把多个改动攒成一个大提交。
- 提交信息遵循 Conventional Commits：`feat:` / `fix:` / `chore:` / `docs:` / `refactor:` 等，标题不超过 100 字符。husky 的 commit-msg 钩子会强制校验。
- pre-commit 钩子通过 lint-staged 对暂存文件跑 oxlint + oxfmt，不要使用 `--no-verify` 绕过。
- 只提交自己改动的文件，用 `git add <明确路径>`，不用 `git add -A` / `git add .`。
- 禁止 `git reset --hard`、`git checkout .`、`git clean -fd`、force push 等破坏性操作。
- 提交前确认工作区 `git status` 干净、无意外文件。

## 依赖安装说明（Windows 踩坑）

本仓库当前使用 npm（无 lockfile）。`npm install` 在这个环境可能卡在写 package.json 阶段，但**依赖包实际已解压到 node_modules**。遇到这种情况：

1. 确认 `node_modules/<包名>` 与 `node_modules/.bin/<命令>` 存在且版本正确；
2. 手动把依赖与版本写进 `package.json` 的 `devDependencies`；
3. 不要反复重跑 `npm install`，也不要删除 `node_modules` 重装。

应用运行时 Electron 会锁住 `node_modules/electron/dist/debug.log`，安装依赖前先关闭应用。安装时加 `--ignore-scripts` 可避免 electron 安装脚本触发文件锁。

## 用户偏好

- 中文交流，回答简洁直接，不写客套话。
- 先说清「为什么需要」，再讲「是什么」「怎么用」。
- 修改配置前先真实检查文件内容，不要凭印象臆造。
- 引用外部配置或方案前先确认信息准确（联网查证或实跑验证）。
