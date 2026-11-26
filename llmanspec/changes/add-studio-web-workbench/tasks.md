# Tasks: add-studio-web-workbench

> 验收 Seam：① 随机端口 `0` 的真实 `node:http` 本地回环服务端集成测试（测 `/api/*`、SSE、`--demo`、导出 `proposal.md` 过 `llman-sdd validate` 且零直写 `llmanspec/specs/`）；② `apps/studio/` 纯逻辑单测（Zustand 5 态与撤销、ThoughtDAG 上下文胶囊、`xstate` 原生 `inspect` 步进、自环/平行边路径、`obsidianmd/pele` 渲染 `llman-sdd graph` 冒烟）+ `rsbuild build` 与全仓 `just qa`。

- [ ] T1 搭建 `apps/studio/` 工程脚手架与本地按需单实例复用 Hub（`studio open / serve --foreground / stop`）：按 `llmanspec/AGENTS.md` 建立 `apps/studio/`（`rsbuild` + React + TypeScript + Tailwind CSS v4），接入根 workspaces 与 lint/format/typecheck 门禁；在 `apps/cli/src/commands/` 实现仅绑 `127.0.0.1` 的 `node:http` 服务（静态托管 `dist/`、`/api/workspaces` 复用 `discoverRoots()` 支持多仓/多 Worktree/子项目 `llmanspec/` 实例隔离、`/api/bootstrap`、`/api/events` SSE、`GET/PUT /api/states/:id`、`--demo` 内置样例），补齐随机端口服务端集成测试。

- [ ] T2 `[blocked-by: T1]` 实现 Zustand 状态库（统一 Git 式变更时间线）与 `@xyflow/react` 直接操纵画布：实现冷热拆表（`layouts` 与领域 `current` 分离）、基于 C1 时间线的撤销/重做/时间旅行观测与回滚、`elkjs` 初始排布、静态 `nodeTypes`/`edgeTypes`、自定义 `StateEdge`（自环/平行边、唯一端口圆点拖线入口、拖到空白处弹环形选建/取消菜单、两端蓝色拖拽重连手柄、中点快捷条、双击就地编辑、`Tab` 速建下游）、全局右键接管与防卡死拖拽会话，并抽象 `CanvasAdapter` 视图插槽；补齐状态流转与边路径纯函数单测。

- [ ] T3 `[blocked-by: T2]` 实现 5 态 UI 状态机、可扩展 Linter、并排红绿体检与全键盘 `Cmd+K`：以 TS 判别联合类型实现 `Explore`（3 档滞回 LOD、亮色 4 皮肤×3 底纹合入「画布」浮层、默认按住 `Alt` 聚焦邻接）、`DraftEdit`、`ReviewDiff`（画布叠加删改红绿虚影 + 前后并排图对比 Modal + Unified Diff 预览 + `main` 默认分支写保护三出口引导）、可扩展 Linter 胶囊与弹层（错误/警告分级、准星飞镜定位、`E2` 自动修复）、就近弹出铁律与 `↑/↓/Enter` 全键盘 `cmdk`，补齐 5 态流转与评论交互单测。

- [ ] T4 `[blocked-by: T2]` 实现 `Simulate` 单步试跑态（`xstate` + 原生 `inspect` API）：在 `apps/studio/` 引入 `xstate`（不回流污染 `packages/core`），实现 `compileToXStateMachine` 将 `StudioMachineIR` 动态编译为 `createMachine`，通过 `createActor(..., { inspect })` 捕获本地微步与快照事件；UI 高亮当前激活状态、支持在画布直接点击当前态出边或底栏按钮步进（试跑态隐藏编辑快捷条与手柄）、底栏提供守卫真假开关与轨迹面包屑，补齐编译与守卫拦截单测。

- [ ] T5 `[blocked-by: T1, T3]` 实现零盲复制 Prompt 工作台、协商建议层与 `⌘K` 唤起的「变更依赖」侧栏：实现 ThoughtDAG 上下文胶囊与全产品统一的**可视化 Prompt 预编辑大窗**（`BASE→HEAD` 净 Diff 聚合、Token 估算、快捷追加约束芯片、确认复制）；对接 `/api/states/:id/revisions/:revId/:action` 在画布叠加 Agent 虚线红绿修订建议并逐条采纳/拒绝；对接 `/api/states/:id/export-proposal` 一键落盘合法 `proposal.md`；集成 MIT 开源 `obsidianmd/pele` 渲染竖向可拖拽/可全屏的「变更依赖」侧栏，补齐导出校验与 `pele` 渲染冒烟测试。

- [ ] T6 `[blocked-by: T3, T4, T5]` 完成静态构建集成与全仓门禁验证：验证 `rsbuild build` 产出静态 `apps/studio/dist/` 后 `llman-sdd studio serve --no-open --demo` 可独立启动并正常响应静态页与 `/api/bootstrap`，运行全仓 `just qa` 确认全部门禁变绿。
