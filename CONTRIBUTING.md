# 贡献指南

感谢你愿意改进 omp-desktop。本指南说明如何把改动顺利合入，请在开始前读完。

## 你能贡献什么

- 修复 bug、补全 omp/ACP 已有的能力在界面上的呈现
- 改进可用性、可访问性、视觉一致性与性能
- 完善文档、测试与工程化配置

**不在范围内**：没有后端支撑的伪功能（账号、套餐、积分、云端助理、定时任务、资料库、发现/分享等）。omp 没有对应能力时，不要为了「像某个产品」而硬做界面。详见 [AGENTS.md](./AGENTS.md) 的「能力边界」。

## 环境准备

- Node.js >= 20.19.0（本机已验证 22.22.2）
- npm 10.x（本仓库使用 npm，见 `packageManager` 字段）
- 本机可用 `bun` 与 omp CLI：应用通过 `bun <omp-cli> acp` 启动 agent。路径在应用设置里配置，首次启动会自动探测常见位置。

安装依赖：

```bash
npm install --ignore-scripts
```

Windows 注意：安装前先关闭正在运行的应用，否则 Electron 会锁住 `node_modules/electron/dist/debug.log`。若 `npm install` 卡在写 `package.json` 阶段但包已解压，手动登记版本即可，详见 [AGENTS.md](./AGENTS.md) 的依赖安装说明。

## 开发流程

```bash
npm run dev      # 仅渲染层热更新
npm run build    # 全量构建
npm start        # 启动桌面应用（需先 build）
```

改动完成后，提交前必须执行：

```bash
npm run check    # = lint + format:check + build
```

全部通过再提交。不要只跑 build 就提交——lint 和格式检查同样重要。

## 代码约定

- 改代码前先读 [AGENTS.md](./AGENTS.md)，尤其是架构、代码风格与能力边界。
- 格式化交给 `npm run format`，不要用编辑器的其他格式化器覆盖。
- 新增 ACP 能力时，在 `acp-client.ts` 里加类型安全的方法，并在 `App.tsx` 里处理对应事件；不要绕过客户端直接发裸 JSON-RPC。
- 主题只有浅色 / 深色 / 跟随系统三档，样式统一走 CSS 变量。
- 模型和推理档位从 ACP 动态读取，禁止硬编码。

## 提交与钩子

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 增加会话搜索
fix: 修复 bun 路径探测失败
docs: 补充贡献指南
chore: 升级 oxlint 版本
```

类型限定为 `feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore` / `revert`，标题不超过 100 字符。

仓库通过 husky 配置了两个钩子：

- **pre-commit**：lint-staged 对暂存文件执行 `oxlint --fix` 与 `oxfmt --write`
- **commit-msg**：commitlint 校验提交信息格式

不要使用 `--no-verify` 绕过钩子。如果钩子报错，修复内容而不是跳过检查。

## Pull Request

1. 一个 PR 只做一件事，改动越小越好评审。
2. 描述清楚：改了什么、为什么改、如何验证。
3. 确认 `npm run check` 通过，且没有无关文件（构建产物、本地配置、调试代码）。
4. 涉及 UI 改动时附截图，说明浅色和深色两种主题下的效果。
5. 不要提交 `dist/`、`node_modules/`、`.env` 等被忽略的文件。

## 报告问题

提 issue 时请写明：复现步骤、期望行为、实际行为、运行环境（Node 版本、omp 版本、操作系统）、相关日志（应用设置面板里的 omp 输出）。信息越具体，越容易定位。
