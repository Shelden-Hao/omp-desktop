# AGENTS.md

本文件是 AI 编码助手在本仓库工作时的规约。开始改动前先完整阅读本文件。

## 项目定位

`omp-desktop` 是 omp（oh-my-pi）coding agent 的**桌面外壳**：一个 Electron 应用，通过 **ACP（Agent Client Protocol）** 与本地 omp 进程通信，提供图形界面。它不是 agent 本身，不重新实现 agent 逻辑。

核心原则：**外壳只呈现 omp/ACP 真实具备的能力，不硬造没有后端支撑的功能。**

## 目录与分层

四层单向依赖，任何改动先判断属于哪一层，再决定文件位置。

```
shared/   ← main/ 、preload/ 、renderer/ 都只能向下依赖 shared
main/     ← 只依赖 shared + electron + node
preload/  ← 只依赖 shared + electron
renderer/ ← 只依赖 shared + react
```

### 硬性约束

- **禁止反向依赖**：`main` 不许 import `renderer`，`renderer` 不许 import `main`，`preload` 不许 import 两边的实现文件。共享内容只能放 `shared/`。
- **禁止跨层调用**：渲染层不直接用 Node/Electron 能力；需要系统能力就在 `main/ipc` 加通道、在 `shared/bridge.ts` 加签名、在 `preload` 加转发。
- **`main/ipc/*` 只做通道**：注册 `ipcMain.handle`、收口参数、把异常转成 `{ ok, error }`，不写业务分支。
- **`main/services/*` 不碰窗口**：不许出现 `ipcMain`、`BrowserWindow`、`webContents`；进程退出、窗口广播这类事由 `ipc` 或 `bootstrap` 负责。
- **`main/platform/*` 只包系统 API**：`powerSaveBlocker`、`session.setProxy`、`setLoginItemSettings`、`shell.*`、`dialog.*` 一律集中在这里。
- **`renderer/core/*` 不 import React**：纯函数、纯类，可以被任意组件复用，也可以直接单测。
- **`renderer/components/*` 不自取数据**：不发 IPC、不读 `settings` 全局，只通过 props 接收数据与回调。
- **`renderer/panels/*` 才是容器**：设置页、技能页这种「一整块业务」的界面可以自己调 `window.desktop`、自己管内部状态；判断标准是「这块能不能被单独放进另一个页面复用」，能就写面板、不能就写组件。
- **`renderer/hooks/*` 放跨界面复用的状态编排**：只做「状态 + 副作用 + 对外句柄」，不写 JSX；`App.tsx` 通过 hook 拿到句柄后再装配组件。消息归并、视图模型这类无副作用的规则仍然放 `core/`。
- **`App.tsx` 只做装配**：不放解析、格式化、正则匹配、DOM 操作；这些属于 `core/` 或对应 hook。

### 文件职责

- 一个文件一个概念，文件名说明它是什么：`message-list.tsx` 放消息列表，`markdown.ts` 放解析与渲染组件，不要把两件事塞一起。
- 展示组件用大驼峰（`ContextMeter.tsx`），纯逻辑模块用小写中划线（`context-report.ts`）。
- 单文件超过 400 行先想能不能按概念拆，不要按行数硬切。
- 新增界面区域时，同时在 `styles/` 里找到对应文件加样式，不要把新规则堆到别的域。
- 设置页按分页拆：`panels/settings/index.tsx` 管草稿态、数据加载与导航，`panes/*.tsx` 每页只管自己的 `<section>`，跨页共用控件放 `panels/settings/controls.tsx`。
- 技能页按「数据 / 卡片 / 分页 / 浮层」拆：`panels/skills/use-skills-panel.ts` 管状态与动作，`InstalledTab` 与 `MarketTab` 各管一页布局，`SkillCard` / `SkillDetail` / `SkillDialogs` 只接 props，文案与归一化在 `labels.ts`。

### 样式文件分工

`styles/index.css` 只做 `@import` 汇总，顺序即层叠优先级，**新增文件必须插到语义相邻的位置并保持「基础 → 局部 → 覆盖」的方向**，否则同权重规则会被前面的盖掉。

| 文件                  | 负责                                                   |
| --------------------- | ------------------------------------------------------ |
| `base.css`            | 设计变量（含深色主题）、reset、滚动条、`.omp-app` 外壳 |
| `titlebar.css`        | 标题栏、任务筛选菜单                                   |
| `workspace.css`       | 工作区两栏、主区域与内容容器                           |
| `chat.css`            | 消息列表、气泡、代码块、Markdown、工具调用、空状态     |
| `composer.css`        | 输入框、chip、底栏与按钮                               |
| `composer-panels.css` | 安全等级、上下文用量面板                               |
| `model-panel.css`     | 模型与推理档位面板                                     |
| `preview.css`         | 文件预览栏                                             |
| `modals.css`          | 权限/敏感信息弹窗、日志折叠块                          |
| `skills.css`          | 技能管理面板                                           |
| `composer-menu.css`   | 窄窗口适配、输入区聚合入口菜单                         |
| `settings.css`        | 设置页、外观、模型列表、安全中心、模型编辑弹窗         |

只改主题色时动 `base.css` 的变量即可，不要在域文件里硬编码颜色——深浅色两套变量会自动跟随。

### 新增一个设置项的完整路径

1. `shared/types/settings.ts`：加字段与注释。
2. `main/services/settings-service.ts`：默认值、持久化校验。
3. 需要系统行为 → `main/platform/`；需要业务编排 → `main/services/`。
4. 需要暴露给界面 → `main/ipc/*` + `shared/bridge.ts` + `preload`。
5. `renderer/panels/settings/panes/*.tsx`：加控件，并在 `panels/settings/index.tsx` 里按 `panels/settings/settings-nav.ts` 的顺序挂上；导航顺序必须与渲染顺序一致，否则滚动联动会错位。
6. 需要作用到 omp 配置 → `main/services/omp-config-service.ts`。

### 新增一个 ACP 事件的完整路径

1. `shared/protocol.ts`：补事件类型。
2. `renderer/core/acp/client.ts`：只做协议搬运，不写界面逻辑。
3. `renderer/core/acp/event-router.ts`：把 `session/update` 解析成描述性指令（effect），并在这里决定字段兼容；工具类 RPC 的方法表也在这里。
4. `renderer/core/acp/apply-effect.ts`：需要派生会话能力态（模式/配置项/用量）时加纯 reducer。
5. `renderer/hooks/use-agent-connection.ts`：在 `handleEvent` 的 switch 里分发到对应 store 方法；消息类指令走 `useMessageStore`，能力类走 `apply-*`。
6. 展示落在 `renderer/components/chat/*`。

### 渲染层 hook 的分工

| hook                     | 负责                                                        | 不负责                   |
| ------------------------ | ----------------------------------------------------------- | ------------------------ |
| `use-message-store`      | 消息数组读写、工具下标                                      | 网络与协议               |
| `use-agent-connection`   | ACP 进程生命周期、事件分发、会话索引与历史、`/context` 探测 | 输入区、预览栏、设置面板 |
| `use-agent-prompt`       | 发送/中断/重试、敏感拦截、失效会话重绑                      | 会话列表维护             |
| `use-agent-capabilities` | 运行模式、配置项、模型面板行                                | 事件来源                 |
| `use-composer-editor`    | contenteditable、`@`/`/` 联想、chip                         | 消息发送                 |
| `use-running-flag`       | `running` 的 state + ref 单一来源                           | 谁把它设为 true          |

连接只在内部 `epoch` 变化时重建（切换安全等级），事件回调通过 ref 调用，不要给连接 effect 增加回调依赖。

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

## 能力边界

参考界面时只借鉴布局与视觉，**不要**在代码中出现任何其他产品的品牌字样。

只实现 omp/ACP 确实支持的能力：会话（新建/切换/恢复/取消）、消息与工具调用、文件读写回调、终端回调、模型与推理档位切换（`session/set_mode`、`session/set_config_option`）、本地文件预览等。

**不实现**没有后端支撑的功能：账号登录、套餐/积分、云端助理、发现/分享/点赞等。遇到这类需求，先确认 omp 是否有对应能力，没有就明确拒绝。

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

- 中文交流、中文注释、中文提交信息，回答简洁直接，不写客套话。
- 先说清「为什么需要」，再讲「是什么」「怎么用」。
- 修改配置前先真实检查文件内容，不要凭印象臆造。
- 引用外部配置或方案前先确认信息准确（联网查证或实跑验证）。
- 每完成一个任务后重启项目打开交由个人完成验证，交给人类做功能验证或者 bug 修改校验。

- 每完成一个功能或修复一个 bug：先单独 commit + push，再重启应用（关掉旧实例后 `env -u ELECTRON_RUN_AS_NODE npm start`）交由用户检查验证。
