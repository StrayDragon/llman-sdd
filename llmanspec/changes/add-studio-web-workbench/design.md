# Design: Studio Web 自举交互工作台、方言引擎与实时依赖图视图

本设计锁定 `add-studio-web-workbench`（C3）的工程布局、本地回环服务 API（含 TextFold 外部服务代理槽与自动保存防丢态）、自举 3 层 `studio-web` 状态机模型、全站统一 3 层交互契约、图方言隔离 Linter、XState 原生 `inspect` 推演以及基于 `obsidianmd/pele` 的实时「变更依赖」视图。

---

## D1 Monorepo 工程布局与 `llman-sdd studio serve` 托管

按 `llmanspec/AGENTS.md`（Web 打包器锁定 `rsbuild`，运行时仅用 `node:` / Web 标准 API）：

- **前端包 `apps/studio/`**（`@llman-sdd/studio`，private）：
  - 打包器：`@rsbuild/core` + `@rsbuild/plugin-react`；
  - UI 与画布依赖：`react`、`react-dom`、`@xyflow/react`、`elkjs`、`zustand`、`zundo`、`tailwindcss`（v4）、`cmdk`、`xstate`（仅前端推演用，不污染 `packages/core`）、`obsidianmd/pele`（MIT，零运行时依赖）；
  - 开发态：`rsbuild dev` 代理 `/api/*` 到本地 CLI 服务；
  - 分发/常规使用态：`rsbuild build` 产出静态 `apps/studio/dist/`，纳入构建脚本与 `tsc --noEmit` / `oxlint` / `oxfmt` 门禁。
- **CLI 本地服务入口（按需单实例复用 Hub + `--foreground`）**：
  - 挂载于 `apps/cli/src/commands/studio.ts`（复用 C2 纯父分组框架），提供 `studio open`（默认按需单实例复用）、`studio serve --foreground`（开发与测试前台直跑）与 `studio stop`（关停本地 Hub，绝不装开机常驻系统服务）；
  - 选项：`--port <n>`（默认 `4710`）、`--host <addr>`（默认 `127.0.0.1` 仅本地回环）、`--no-open`、`--foreground`、`--demo`（仓库 0 状态表时载入内置自举与样例）、`--directory <path>`；
  - 仅用 `node:http` + `node:fs` 托管静态 `dist/`、REST API 与 SSE 文件监听，零额外 HTTP 框架依赖；
  - **多仓 / 多 Worktree / 子项目 `llmanspec/` 统一根隔离**：复用 `packages/core/src/validation/roots.ts` 的 `discoverRoots()` 与 `worktreeList()`，以三元组 `Repo → Worktree (Branch) → llmanspec/ Instance` 标识工作区（单实例仓平铺展示，多子项目仓如 `xylitol` 自动列出每个有效 `llmanspec/` 实例）。第二个仓库或 worktree 运行 `studio open` 时复用既有 `4710` 服务注册工作区并打开 `/p/<wsKey>`，杜绝端口冲突与跨实例 `localStorage` 串仓。

---

## D2 本地 HTTP / SSE 协议契约、自动保存防丢态与 TextFold 转发

所有核心域逻辑均委托 C1（`packages/core/src/studio/*`）与 C2 原子存储（`.llman-sdd/studio/states/`）；写接口全部带工作区作用域校验（`/api/p/:wsKey/...`，单实例兼容缺省默认根）：

| 端点 | 方法 | 职责 |
| --- | --- | --- |
| `/api/workspaces` | `GET` / `POST` | 枚举已注册仓库、关联 Git Worktree 及 `discoverRoots()` 发现的全部有效 `llmanspec/` 实例；支持注册新目录或将草稿带入目标可写 worktree |
| `/api/bootstrap` | `GET` | 返回当前实例纳管状态机/流程图/决策表/规则文档清单（`--demo` 时含自举 `studio-web` 3 层模型与业务样例）、草稿与时间线摘要、分支写保护状态、可写 peer worktree 及 `graphMermaid` 文本 |
| `/api/events` | `GET` (SSE) | 防抖监听当前实例 `llmanspec/specs/`、`llmanspec/changes/` 与 `.llman-sdd/studio/states/`（Agent 经 CLI/MCP 写回评论或修订建议时秒级推送浏览器） |
| `/api/states/:id` | `GET` / `PUT` | 读取或防抖原子写回本地草稿状态、Git 式时间线、评论与 `baseHash`（严禁写盘到 `llmanspec/specs/`） |
| `/api/layouts/:machineKey` | `GET` / `PUT` | 独立持久化节点 `(x, y)` 坐标与折叠态至 `.llman-sdd/studio/layouts/`（刷新不散架、拖排版不污染语义 Diff） |
| `/api/states/:id/revisions/:revId/:action` | `POST` | `accept` 或 `reject` Agent 提交的修订建议（调用 C1 纯函数原子应用并追加时间线记录） |
| `/api/states/:id/preview-diff` | `POST` | 调用 C1 `renderUpdatedFeatureSource` + `previewFeatureUnifiedDiff` 返回内存行级 Unified Diff 预览；同步校验磁盘 `baseHash` 防外部覆盖冲突 |
| `/api/states/:id/export-proposal` | `POST` | 调用 C1 `buildProposalDraft` 在当前实例 `llmanspec/changes/<changeId>/proposal.md` 落盘新 Change 草案（不触碰 `llmanspec/specs/`） |
| `/api/textfold/fold` | `POST` | 统一 TextFold 语义折展入口：先查 `.llman-sdd/studio/textfold-cache.json`（按 `sha256(content)` 命中即 0-Token 返回）；未命中且用户配置了外部 TextFold serve 时代理转发，否则优雅降级到本地确定性 AST 5 级折展 |

### D2.1 TextFold 双层 Provider 集成策略（零依赖兜底 + 可选外部 Serve 转发）
1. **Tier 0（内置确定性 AST 折展，默认离线可用）**：直接从解析后的 `.feature` AST 提取 5 级结构投影（全文 / 简述 / 关键句 / 要点 / 主题），按 `sha256(content)` 缓存，0 Token、0 外部依赖；
2. **Tier 1（可选外部 TextFold Serve 透明代理）**：若用户本机或内网自行运行了 TextFold 服务（经 `LLMAN_SDD_TEXTFOLD_URL` 或 `llmanspec/config.yaml` → `studio.textfold.endpoint` 显式配置），`studio serve` 作为同源薄代理将未命中缓存的内容转发至该服务（超时上限 5s，显式配置才启用），回写本地 `sha256` 缓存；服务不可达时自动降级回 Tier 0 并通过徽标明确标注来源（`TextFold 服务缓存` / `本地 AST 折展`）。

### D2.2 编辑器防丢态体系（3 层防丢 + 1 层防覆盖）
1. **服务端静默防抖自动保存（~400ms）**：语义编辑、评论增删/解决、时间线回滚自动防抖 `PUT /api/states/:id`，顶栏克制显示 `保存中` → `草稿已保存`；
2. **浏览器断连 / 崩溃恢复缓存**：同步写入按 `workspaceKey + stateId` 隔离的本地恢复快照；若 `studio serve` 重启或浏览器意外关闭，重开时比对时间戳提示一键恢复未同步改动；
3. **布局坐标解耦持久化**：`(x, y)` 排布独立存 `/api/layouts/*`，拖动整理布局绝不污染语义 Diff 与撤销栈；
4. **`beforeunload` + `baseHash` 乐观锁**：仅当存在未落盘的防抖写入时提示拦截；点击「保存变更」写回 `.feature` 前强制重算磁盘 `baseHash`，检测外部 `git pull` 或 Agent 修改时拒绝静默覆盖并引导三方校准。

---

## D3 自举 3 层 `studio-web` 模型与前端状态架构

**自举原则**：`studio-web` 本身作为首个全面拥抱本系统的规范样例（落地 `llmanspec/specs/studio-web.feature`），以 3 层嵌套状态机完整建模自身全部交互状态：
- **L1 主状态机（`studio-web`）**：`启动与工作区就绪` → `全景与导航态` → `画布直编与草稿态` ↔ `推演试跑态` / `体检与协商态` → `写保护与保存变更`（6 大主态，Linter 0 错 0 警）；
- **L2 子状态机**：`画布直编子机`（空闲 / 选中 / 就地编辑 / 拖线连接 / 右键统一菜单 / 时间线观测）、`体检与协商子机`（方言 Linter / 红绿 Diff / 锚点 Prompt / Agent&Trace 裁决）、`写保护与保存子机`（分支校验 / 默认分支护栏 / 切 Worktree / 仅导提案 / 直写 `.feature`）；
- **L3 子状态机**：`拖线连接与选建子机`（拉出虚线 / 吸附目标 / 拖空选建菜单 / 写入草稿 / 取消自愈）。

前端工程架构（单一状态库 + 冷热拆表 + 扩展槽）：
1. **单一状态库（Zustand + `zundo`）**：
   - `StudioStore` 集中管理工作区隔离状态、多 Tab、双向视图导航栈 `navHistory`（`← / →`）、3 层嵌套栈 `nestStack`、时间线与 `StudioMode`（`explore` / `simulate` / `draft` / `review` / `negotiate`）；
   - **嵌套子树改动冒泡**：`hasSubtreeChanges(rootId)` 递归感知 L2/L3 子图改动并在父节点标出绿点与 `· 已改`，父层「对比 & 协商」与「保存变更」自动聚合整棵子树净 Diff；
   - **时间线净对冲消元**：汇总 Diff 与导出 Prompt 始终基于 **`实际真理 BASE` vs `当前草稿 HEAD`** 计算，对反向操作（如 `改名 A→B` 后 `B→A`、或删除原边后用相同语义签名 `(from, to, event, guard)` 重建）做语义消元，彻底消除无效中间噪音。
2. **冷热拆表（防卡顿）**：
   - 节点 `(x, y)` 坐标与语义草稿分离；拖动节点 60fps 零 Diff 重算、零校验重跑；`nodeTypes` / `edgeTypes` 声明为模块级静态常量。
3. **状态机 / 流程图专用布局与边路由**：
   - 初始排布使用 `elkjs`（`layered` 算法），跳过自环避免布局畸变；
   - 自定义 `StateEdge` 处理**自环 SVG 弧**与**双向/多守卫平行边**（按配对索引偏移曲率），确保标签零重叠。
4. **双扩展插槽（`CanvasAdapter` + `SearchProvider`）**：
   - `CanvasAdapter`：C3 落地 `StateMachineCanvas`（支持状态机与流程图双图方言）、`SpecDocCanvas`（决策真值表与 Gherkin 规则条款 + 评论/协商闭环）与 `ChangeDagPanel`（`obsidianmd/pele`）；为 C5 全景拓扑与多分组 Tab 预留统一槽位；
   - `SearchProvider`：全局 `⌘K` 与 `+ 新标签页` 搜索框共享同一组件，MVP 提供当前工作区实时规格 + 嵌套状态/步骤直跳 + 命令检索，并**显式预留 `RAG 语义检索` Provider 插槽**（零 UI 重写即可热插拔接入）。

---

## D4 交互不变量与全站认知一致性契约（经交互 Demo 完整验证定稿）

1. **极简单一查看模型（彻底去冗余窗口）**：
   - 砍掉只读「原地透视」、半屏只读分栏与自由悬浮编辑窗；
   - 全站统一为：**全景卡片 → `进入 Tab`；嵌套复合节点 → `进入子图`**；需要同时对照两张完整可编辑画布时直接浏览器多开窗口/标签页即可。
2. **全站统一 3 层交互契约（零重叠、零猜测）**：
   - **Hover（悬停）**：仅做只读路标（边框高亮、节点可拖端口圆点、tooltip、`Alt` 聚焦邻接），绝不弹破坏性按钮或大菜单；
   - **Left-Click（单击 / 双击）**：
     - 单击 = 干净选中（高亮选框与连线两端重连手柄，**无单选悬浮操作条，绝不自动弹出右侧大抽屉**；仅全景框选 ≥2 节点时出批量「打包分组 / 建 Tab / 打 Tag」条）；
     - 卡片/节点显式主导航按钮（`进入 Tab` / `进入子图` / 评论数字气泡 `(N)`）左键直达；
     - 双击节点或连线（及选中按 `Enter`）= 就地编辑文字/事件（需具备跨重绘防抖判定，全景卡片禁止双击意外展开）；
   - **Right-Click（右键）**：**全站唯一的完整动作圆盘**（严格按全景 / 状态机 / 流程图方言隔离，绝不重复卡片上已有的 `进入 Tab` / `进入子图`，绝不混入皮肤或开发 Mock 项）。
3. **盒中盒嵌套上下文 + 就近贴框面包屑**：
   - 下钻任意嵌套子状态机或子流程图时，外框自动呈现父层上下文，左右两侧动态投影父层真实的相邻前置/去向节点与带标签跨界箭头（点击相邻门户直接返回上层并定位该节点）；
   - 嵌套面包屑（`[← 返回上层] 父图 › 子图 L2/L3`）直接贴合在外框顶部上沿，零跨屏眼动跳转，支持 `Alt+↑` 逐层返回。
4. **注意力就近原则（Spatial Locality）与上下文感知顶栏**：
   - **所有微反馈 Toast、就地编辑框、嵌套贴框面包屑、漂移校准卡一律在触发焦点/鼠标附近弹出**（视口防溢出、纯 `opacity/transform` 过渡、`pointer-events: none` 不阻断连续点击）；
   - **对称双向导航**：左上标签岛内置 `‹ / ›`（`Alt+← / Alt+→` 跨 Tab 与嵌套层双向视图历史），与右上 `↶ / ↷`（`⌘Z / ⌘⇧Z` 编辑撤重）对称；
   - **上下文感知顶栏降噪**：`+ 新标签页` 右上角仅保留工作区切换器（隐藏 Linter 与重复 `⌘K`）；规则/决策表 Tab 隐藏图 Linter；顶部静态小贴士条采用固定宽度与原地文本更新（连点 `‹ / ›` 按钮零位移、不失焦；未来完整交互向导收口至「设置 → 向导」）。
5. **设置 SSOT 与无黑话文案**：
   - 左下视图栏仅保留缩放、**`重置视图`**、**`视图：图标 | 摘要 | 详情`** 与 **`画布`** 入口；皮肤（4 套低饱和亮色）× 底纹（3 种）、缩放自适应/锁定、悬停聚焦、连线样式、小地图/图例/小贴士开关全部收口在 **`画布`** 设置面板作为唯一 SSOT（移除重复小锁头）；
   - 底栏主操作统一命名为 **`保存变更`**，受保护主干分支首次进入草稿时给出 1 条轻提示预期，点击 `保存变更` 弹出三出口护栏向导；
   - 全产品任意复制 Prompt 入口强制先经过**可视化 Prompt 预编辑工作台（零盲复制）**，锚定评论携带 `[定位: <图> · 节点/连线(uid)]` 且支持 **`解决 / 重开 / 删除`**。
6. **图方言隔离 Linter（绝不串规则）**：
   - 状态机：`STATE MACHINE LINTER`（`E1` 结构、`E2` 确定性含自动修复、`E3` 可达、`E4` 死锁/陷阱、`W1` 守卫兜底、`W2` 占位命名）；
   - 流程图：`FLOWCHART LINTER`（`F1` 起止完整、`F2` 步骤可达、`F3` 条件网关双分支告警、`F4` 占位命名）；
   - 全景拓扑：`TOPOLOGY LINTER`（`W3` 孤立规格节点）。
   - 4 种规格类型（状态机 / 流程图 / 决策表 / 规则文档）全部具备专属展示与「评论 → 协商 Prompt」闭环。

---

## D5 基于 `xstate` + 原生 `inspect` API 的单步推演（`Simulate`）

- 编写纯函数 `compileToXStateMachine(machine: StudioMachineIR, guardValues: Record<string, boolean>)`：
  - 将 `states` 与 `transitions` 编译为 XState v5 `createMachine` 配置，为每个 `guard` 绑定动态读取 `guardValues[guardName]` 的守卫函数；
  - 通过 `createActor(compiled, { inspect })` 订阅原生 `@xstate.snapshot` / `@xstate.event` / `@xstate.microstep`（零云端 relay，纯本地运行）；
- UI 体验：状态机文案为「单步试跑」、流程图文案为「流程推演」；高亮当前激活节点，支持直接点击画布当前态出边或底栏按钮步进，底栏提供守卫真假开关与轨迹面包屑，推演态隐藏编辑交互。

---

## D6 实时「变更依赖」侧栏视图（`obsidianmd/pele`，`⌘K` 唤起）

- 统一命名 **「变更依赖」**，通过 `⌘K` 或 `+ 新标签页` 唤起，直接消费 `/api/bootstrap` 与 `/api/events` 推送的 `graphMermaid` 文本；
- 默认以左侧可拖拽竖向侧栏呈现，支持风格浮层（排布方向 `竖向/横向`、连线 `折线/曲线/直线`、密度 `标准卡片/紧凑芯片`）与 `独占全屏` 模式；
- 使用 MIT 开源 **`obsidianmd/pele`** 渲染同步 SVG 并通过 CSS 变量适配 4 套亮色皮肤。

---

## 测试边界（Seam）

C3 的验收 seam 拆为两条互补边界：
1. **本地回环服务端 Seam（`tests/unit/studio-server/` 或 `tests/integration/`）**：起随机端口 `0` 的真实 `node:http` Studio 服务 + 临时仓库，验证 `/api/workspaces`、`/api/bootstrap`（含 `--demo` 自举模型与 `graphMermaid`）、`PUT /api/states/:id`（防抖原子写入与 `baseHash` 校验）、`/api/layouts/:machineKey`、`/api/textfold/fold`（本地 AST 折展 + 缓存命中 + 模拟外部 TextFold serve 转发与降级）、`/api/states/:id/revisions/:revId/accept`、`/api/states/:id/preview-diff`、`/api/states/:id/export-proposal`（产物过 `llman-sdd validate`）及 SSE 推送，并断言零直接写入 `llmanspec/specs/`。
2. **前端纯逻辑与构建 Seam（`apps/studio/`）**：单测覆盖自举 3 层 `studio-web` 模型加载、时间线净 Diff 语义对冲消元、子树脏状态冒泡、`SearchProvider` 工作区动态索引（含嵌套状态直跳与 RAG 槽位）、方言隔离 Linter（`E1–E4+W1–W2` vs `F1–F4` vs `W3`）、双向 `navHistory` 前退栈、评论解决/删除、`compileToXStateMachine` + 原生 `inspect` 步进、自环/平行边路径与 `obsidianmd/pele` 渲染冒烟；构建验证 `rsbuild build`、`tsc --noEmit` 与全仓 `just qa` 全绿。
