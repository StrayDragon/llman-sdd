# Design: Studio Web 单状态机交互工作台与实时依赖图视图

本设计锁定 `add-studio-web-workbench`（C3）的工程布局、本地回环服务 API、前端状态与画布架构、5 态低认知负担交互、XState 原生 `inspect` 试跑以及基于 `obsidianmd/pele` 的实时 `llman-sdd graph` 依赖图视图。

---

## D1 Monorepo 工程布局与 `llman-sdd studio serve` 托管

按 `llmanspec/AGENTS.md`（Web 打包器锁定 `rsbuild`，运行时仅用 `node:` / Web 标准 API）：

- **前端包 `apps/studio/`**（`@llman-sdd/studio`，private）：
  - 打包器：`@rsbuild/core` + `@rsbuild/plugin-react`；
  - UI 与画布依赖：`react`、`react-dom`、`@xyflow/react`、`elkjs`、`zustand`、`zundo`、`tailwindcss`（v4）、`cmdk`、`xstate`（仅前端试跑用，不污染 `packages/core`）、`obsidianmd/pele`（MIT，零运行时依赖）；
  - 开发态：`rsbuild dev` 代理 `/api/*` 到本地 CLI 服务；
  - 分发/常规使用态：`rsbuild build` 产出静态 `apps/studio/dist/`，纳入构建脚本与 `tsc --noEmit` / `oxlint` / `oxfmt` 门禁。
- **CLI 本地服务入口（按需单实例复用 Hub + `--foreground`）**：
  - 挂载于 `apps/cli/src/commands/studio.ts`（依赖 C2 纯父分组框架），提供 `studio open`（默认按需单实例复用）、`studio serve --foreground`（开发与测试前台直跑）与 `studio stop`（关停本地 Hub，绝不装开机常驻系统服务）；
  - 选项：`--port <n>`（默认 `4710`）、`--host <addr>`（默认 `127.0.0.1` 仅本地回环）、`--no-open`、`--foreground`、`--demo`（仓库 0 状态表时载入 C1 内置 2 套样例）、`--directory <path>`；
  - 仅用 `node:http` + `node:fs` 托管静态 `dist/`、REST API 与 SSE 文件监听，零额外 HTTP 框架依赖；
  - **多仓 / 多 Worktree / 子项目 `llmanspec/` 统一根隔离**：复用 `packages/core/src/validation/roots.ts` 的 `discoverRoots()` 与 `worktreeList()`，以三元组 `Repo → Worktree (Branch) → llmanspec/ Instance` 标识工作区（单实例仓平铺展示，多子项目仓如 `xylitol` 自动列出每个有效 `llmanspec/` 实例）。第二个仓库或 worktree 运行 `studio open` 时复用既有 `4710` 服务注册工作区并打开 `/p/<wsKey>`，杜绝端口冲突与跨实例 `localStorage` 串仓。

---

## D2 本地 HTTP / SSE 协议契约

所有业务逻辑均委托 C1（`packages/core/src/studio/*`）与 C2 原子存储（`.llman-sdd/studio/states/`）；写接口全部带工作区作用域校验（`/api/p/:wsKey/...`，单实例兼容缺省默认根）：

| 端点 | 方法 | 职责 |
| --- | --- | --- |
| `/api/workspaces` | `GET` / `POST` | 枚举已注册仓库、关联 Git Worktree 及 `discoverRoots()` 发现的全部有效 `llmanspec/` 实例；支持注册新目录或将草稿带入目标可写 worktree |
| `/api/bootstrap` | `GET` | 返回当前实例纳管状态机列表（`--demo` 时含内置样例）、本地草稿与时间线摘要、当前 Git 分支/是否默认写保护状态、可写 peer worktree 及 `graphMermaid` 文本 |
| `/api/events` | `GET` (SSE) | 防抖监听当前实例 `llmanspec/specs/`、`llmanspec/changes/` 与 `.llman-sdd/studio/states/`（Agent 经 CLI/MCP 写回评论或修订建议时秒级推送浏览器） |
| `/api/states/:id` | `GET` / `PUT` | 读取或原子写回本地草稿状态、Git 式时间线与 `layouts` 坐标（严禁写盘到 `llmanspec/specs/`） |
| `/api/states/:id/revisions/:revId/:action` | `POST` | `accept` 或 `reject` Agent 提交的修订建议（调用 C1 纯函数原子应用并追加时间线记录） |
| `/api/states/:id/preview-diff` | `POST` | 调用 C1 `renderUpdatedFeatureSource` + `previewFeatureUnifiedDiff` 返回内存行级 Unified Diff 预览 |
| `/api/states/:id/export-proposal` | `POST` | 调用 C1 `buildProposalDraft` 在当前实例 `llmanspec/changes/<changeId>/proposal.md` 落盘新 Change 草案（不触碰 `llmanspec/specs/`） |

---

## D3 后端友好的前端架构（单一状态库 + 冷热拆表 + 插件槽）

1. **单一状态库（Zustand + `zundo`）**：
   - `StudioStore` 集中管理 `stateDoc`、`activeMachineKey`、`selectedAnchor`、`foldLevel`（1–4 级语义折展）、`selectedContextIds`（ThoughtDAG 上下文胶囊勾选集）与 5 态 UI 状态机：
     ```ts
     export type StudioMode =
       | { kind: 'explore' }
       | { kind: 'simulate'; currentStateUid: string; guardValues: Record<string, boolean>; trace: SimStep[] }
       | { kind: 'draft' }
       | { kind: 'review' }
       | { kind: 'negotiate' };
     ```
   - `zundo` 仅追踪领域草稿（`current` 图变更），提供 `Cmd+Z / Shift+Z` 撤销重做，绝不把画布平移/缩放塞进撤销栈。
2. **冷热拆表（防卡顿）**：
   - 节点 `(x, y)` 坐标独立存于 `layouts[machineKey][stateUid]`；拖动节点时只增量更新坐标，60fps 零 Diff 重算、零校验重跑；
   - `nodeTypes` 与 `edgeTypes` 声明为模块级静态常量，避免 React Flow 闪跳。
3. **状态机专用布局与边路由**：
   - 初始排布使用 `elkjs`（`layered` 算法），跳过自环避免布局畸变；
   - 自定义 `StateEdge` 组件专门处理两类高频状态机边：**自环 SVG 弧（`source === target`）** 与 **同起止点多守卫/双向平行边（按配对索引偏移贝塞尔曲率）**，确保边标签清晰不重叠。
4. **视图适配器插槽（`CanvasAdapter`）**：
   - 主工作区通过统一视图接口挂载：C3 落地 `StateMachineCanvas`（`@xyflow/react`）与 `ChangeDagPanel`（`obsidianmd/pele`）；为后续 **C5（`d3-force` 宏观星图 + 多 Tab 森林）** 与 **广义 Mermaid 可视化编辑（`inkeep/visimer` / `@visimer/react`）** 预留清晰插槽。

---

## D4 5 态 UI 状态机、高效率直接操纵与交互不变量（经原型验证定稿）

严格遵守 [ux-interaction-design.md](../add-studio-domain-core/research/ux-interaction-design.md) 与交互原型验证沉淀的硬不变量：

- **去 AI 味的工程图纸美学与界面减法**：
  - **画布至上、零割裂顶栏**：无全宽顶栏、UI 零 `v*` 版本号、零系统 OS Emoji（统一 `1.85px` 单色 SVG 图标系统）；
  - **亮色多皮肤 × 纸面底纹**：内置 4 套低饱和亮色设计语言（Linear 冷静灰 / 瑞士建筑纸 / 工程蓝图 / 和纸暖墨）× 3 种底纹（无底纹 / 细点阵 / 蓝图格），统一收入左下角 **`画布`** 浮层与 `⌘K`（不占右上角常驻空间）；
  - **三段滞回自适应缩放（`远 / 中 / 近`）** + 锁定/随缩放联动旋钮；ThoughtDAG 式悬停放大可拖拽小地图；
  - **卡片静态去噪**：静态仅展示核心标识与摘要，悬停/选中时渐显操作微按钮；全景无上下文开关时整条底栏隐藏；
  - **严格 8 层 Z-Index 与就近弹出铁律（Spatial Locality）**：顶层瞬态弹层（`L4 z=60`）单一互斥、视口防溢出；任何按钮/卡片/右键触发的浮层、告警卡与悬浮编辑窗**必须紧贴触发源就近弹出**，绝不飞向屏幕远角；右上角左/右栏防横向碰撞、时间线与右抽屉宽屏并排/窄屏互斥；
  - **全局鼠标事件接管与防卡死拖拽**：捕获阶段接管 `contextmenu`（除文本输入与正文选字外禁止连续右键漏出原生菜单）；统一拖拽会话控制器在 `(buttons & 1) === 0` / `blur` / `dragstart` / `contextmenu` 时自动自愈终止。
- **单一权威入口的零下拉框直接操纵**：
  - **连线唯一入口**：仅通过节点端口圆点（`.node-port`）拖出连线（砍掉工具条/底栏/右键菜单的重复连边按钮）；拖到已有卡片直连，**拖到空白画布松手则原地弹出环形选择菜单**（选建普通状态 / 守卫分支 / 终态节点 或 中心 `×` 取消）；
  - **零 `<select>` 下拉框重连**：选中连线仅显示**中点悬浮快捷条 + 两端可拖拽蓝色手柄**（不强弹右侧大抽屉遮挡画布），直拖两端手柄重连起终点，双击标签或按 `Enter` 在画布就地编辑 `事件 [守卫]`，支持一键「插中间态 / 反转方向」；选中状态按 `Tab` 一键速建下游状态并连线。
- **三层浏览/编辑协同模型**：
  - **原地展开（明确只读透视 + 实时镜像）**：支持多级嵌套下钻（`L0 流程图 → L1 状态流转 → L2 下游规格 → L3 Gherkin 条款 → L4 源码与测试证据`，带面包屑回跳），并实时同步外部编辑；
  - **可最小化悬浮编辑窗**：紧贴原卡片弹出、可标题栏拖拽与最小化到底部托盘、一键升格独立 Tab；
  - **浏览器级独立 Tab**：除置顶记忆标签外全部可关闭、全关闭或点 `+` 进入空白引导视图、按实例隔离 `localStorage` 记忆；下钻新 Tab 附悬浮 **`← 返回原 Tab`（`Alt+←`）+ `收为悬浮窗`** 胶囊。
- **可扩展 IDE 风格 Linter + Git 式变更时间线 + 零盲复制 Prompt 工作台**：
  - **Linter 胶囊 + 弹层**：右上角以单胶囊汇总（`校验通过` / `N 错 · M 警`），点击就近展开按 `全部 / 错误 / 警告` 过滤、准星飞镜定位与确定性自动修复（如 `E2` 删重边），可扩展任意新规则；
  - **Git 式变更时间线面板**：明确区分不可变 **`实际 BASE (llmanspec/specs)`** 与 **`编辑 HEAD`**，支持点击任意历史提交无损**只读时间旅行观测**（观测态加锁防误改）、一键回滚（含还原 `BASE`）与 **MVP 单一 Prompt 净 Diff 聚合**；
  - **零盲复制铁律**：全产品任意复制 Prompt 入口（协商抽屉、时间线聚合、漂移裁决「真理胜出」、默认分支引导）均**先弹出可视化 Prompt 预编辑工作台**（实时 Token 估算、快捷追加约束芯片、重置原文、确认复制），绝不盲复制；
  - **`main` 默认分支写保护引导**：在 `main` 上放开全部草稿/协商，点击落盘时弹出可执行引导窗，提供「一键切至可写 Worktree 并带走草稿 / 进入 Prompt 大窗交 Agent 跑 `change start --worktree` / 仅导出 `proposal.md` 草案」三条出口。
- **5 态严格隔离**：
  - **`Explore`（冷静浏览）**：默认按住 `Alt` 聚焦邻接（防误触，可在 `画布` 设置切换）；0 状态表仓库展示引导卡。
  - **`Simulate`（单步试跑）**：见 D5（画布直接点击当前态出边即可步进，禁止试跑态出现编辑快捷条与手柄）。
  - **`DraftEdit`（交互草稿）**：改图自动切入并记录时间线提交；底栏仅留模式级操作。
  - **`ReviewDiff`（红绿体检）**：画布叠加删改红绿虚影（含已删基线节点/边红虚影）+ 支持**前后并排视觉图对比 Modal** + 内存 Unified Diff 预览。
  - **`Negotiate`（Agent 协商）**：ThoughtDAG 上下文胶囊勾选 + 可编辑 Prompt 预编辑大窗 + 虚线红绿 Agent 建议采纳/忽略。
  - **全键盘 `⌘K`（`cmdk`）**：支持 `↑` / `↓` / `Enter` 全键盘执行，集中收纳变更依赖、工作区切换、时间线、Linter、皮肤与演示模拟入口。

---

## D5 基于 `xstate` + 原生 `inspect` API 的单步试跑（`Simulate`）

- 编写纯函数 `compileToXStateMachine(machine: StudioMachineIR, guardValues: Record<string, boolean>)`：
  - 将 `states` 与 `transitions` 编译为标准 XState v5 `createMachine` 配置，为每个出现过的 `guard` 名称绑定动态读取 `guardValues[guardName]` 的守卫函数；
  - 通过 `createActor(compiled, { inspect })` 订阅原生 `@xstate.snapshot` / `@xstate.event` / `@xstate.microstep` 事件（零云端 relay，纯本地运行）。
- UI 体验：
  - 当前激活状态蓝框高亮，只点亮此刻能触发的事件按钮，且**支持在画布上直接点击当前态出边触发单步转移**；
  - 若当前状态有带守卫的出边，底栏自动列出守卫开关（`true` / `false`），切换开关实时反映哪条边被放行或拦截；
  - 试跑轨迹记录与一键重置回初态。

---

## D6 实时「变更依赖」侧栏视图（`obsidianmd/pele`，`⌘K` 唤起）

- 作为边缘辅助功能不占常驻顶栏按钮，统一命名 **「变更依赖」**，通过 **`⌘K`** 唤起，直接消费 `/api/bootstrap` 与 `/api/events` 推送的 `graphMermaid` 文本；
- 默认以**左侧可拖拽竖向侧栏**呈现，支持风格浮层切换（排布方向 `竖向/横向`、连线 `折线/曲线/直线`、密度 `标准卡片/紧凑芯片`）与 **`放大独占` 全屏模式**；
- 前端调用 **`obsidianmd/pele`**（MIT、零运行时依赖、同步 SVG 输出）渲染依赖图，并通过 CSS 变量适配 Studio 亮色多皮肤体系。

---

## 测试边界（Seam）

C3 的验收 seam 拆为两条互补边界：
1. **本地回环服务端 Seam（`tests/unit/studio-server/` 或 `tests/integration/`）**：起随机端口 `0` 的真实 `node:http` Studio 服务 + 临时仓库，验证 `/api/bootstrap`（含 `--demo` 与 `graphMermaid`）、`PUT /api/states/:id`、`/api/states/:id/revisions/:revId/accept`、`/api/states/:id/preview-diff`、`/api/states/:id/export-proposal`（产物过 `llman-sdd validate`）及 SSE 变更推送，并断言零直接写入 `llmanspec/specs/`。
2. **前端纯逻辑与构建 Seam（`apps/studio/`）**：单测覆盖 Zustand 5 态流转与 `zundo` 撤销、ThoughtDAG 上下文胶囊裁剪、`compileToXStateMachine` + 原生 `inspect` 步进（含守卫开关拦截）、自环/平行边 SVG 路径计算、`obsidianmd/pele` 渲染 `llman-sdd graph` 输出冒烟；构建验证 `rsbuild build`、`tsc --noEmit` 与全仓 `just qa` 全绿。
