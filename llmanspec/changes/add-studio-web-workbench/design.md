# Design: Studio Web 自举交互工作台、方言引擎与实时依赖图视图

本设计锁定 `add-studio-web-workbench`（C3）的工程布局、本地回环服务 API（含 TextFold 外部服务代理槽与自动保存防丢态）、自举 3 层 `studio-web` 状态机模型、全站统一 3 层交互契约、图方言隔离 Linter、XState 原生 `inspect` 推演以及基于 `obsidianmd/pele` 的实时「变更依赖」视图。

---

## D1 Monorepo 工程布局与 `llman-sdd studio serve` 托管

按 `llmanspec/AGENTS.md`（Web 打包器锁定 `rsbuild`，运行时仅用 `node:` / Web 标准 API）：

- **前端包 `apps/studio/`**（`@llman-sdd/studio`，private）：
  - 打包器：`@rsbuild/core` + `@rsbuild/plugin-react`；
  - UI 与画布依赖：`react`、`react-dom`、`@xyflow/react`、`elkjs`、`zustand`、`zundo`、`tailwindcss`（v4）、`cmdk`、`xstate`（仅前端推演用，不污染 `packages/core`）、`obsidianmd/pele`（MIT，零运行时依赖）；
  - 开发态：`rsbuild dev` 代理 `/api/*` 到本地 CLI 服务；
  - 分发/常规使用态：`rsbuild build` 产出静态 `apps/studio/dist/`，纳入根 `package.json` workspaces 与 `justfile` 门禁（`tsc --noEmit` / `oxlint` / `oxfmt` / `rsbuild build`）；`apps/cli` 静态资源解析需同时兼容仓库源码直跑与构建分发态路径定位。
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
| `/p/:wsKey/*`（Canonical Deep-Link） | `GET` | 透明内容协商入口（人机同链）：浏览器（`Accept: text/html`）返回 Studio SPA 并内嵌 `<script type="application/json" id="studio-focus-context">` 按 hash 自动定位聚焦；非浏览器 HTTP 客户端（Agent `fetch` / `curl`）默认返回精简 `text/markdown` 规格与当前聚焦摘要及路由提示，`?format=json` 返回结构化 JSON，`?format=html` 强制返回 HTML |
| `/api/textfold/fold` | `POST` | 统一 TextFold 语义折展入口：先查 `.llman-sdd/studio/textfold-cache.json`（按 `sha256(content)` 命中即 0-Token 返回）；未命中且用户在「画布设置」中配置了外部 TextFold serve 时代理转发，否则优雅降级到本地确定性 AST 5 级折展 |

### D2.1 TextFold 双层 Provider 集成策略（零依赖兜底 + 设置页可选外部 Serve 转发）
1. **Tier 0（内置确定性 AST 折展，默认离线可用）**：直接从解析后的 `.feature` AST 提取 5 级结构投影（全文 / 简述 / 关键句 / 要点 / 主题），按 `sha256(content)` 缓存，0 Token、0 外部依赖；
2. **Tier 1（可选外部 TextFold Serve 透明代理）**：若用户本机运行了 `python3 -m textfold serve`（支持自动发现 `~/.local/share/textfold/server.json` 或在「画布设置」/ `LLMAN_SDD_TEXTFOLD_URL` / `llmanspec/config.yaml` → `studio.textfold.endpoint` 显式配置），`studio serve` 作为同源薄代理将未命中缓存的内容转发至该回环服务（绕开浏览器 Origin 校验，超时上限 5s），回写本地 `sha256` 缓存；服务不可达时静默降级回 Tier 0。**严禁在规则正文顶栏暴露“本地 AST / 外部 Serve / 断连降级”开发态调试切换按钮**，所有配置统一收口于「画布设置」。

### D2.2 编辑器防丢态体系（3 层防丢 + 1 层防覆盖）
1. **服务端静默防抖自动保存（~400ms）**：语义编辑、评论增删/解决、时间线回滚自动防抖 `PUT /api/states/:id`，顶栏克制显示 `保存中` → `草稿已保存`；
2. **浏览器断连 / 崩溃恢复缓存**：同步写入按 `workspaceKey + stateId` 隔离的本地恢复快照；若 `studio serve` 重启或浏览器意外关闭，重开时比对时间戳提示一键恢复未同步改动；
3. **布局坐标解耦持久化**：`(x, y)` 排布独立存 `/api/layouts/*`，拖动整理布局绝不污染语义 Diff 与撤销栈；
4. **`beforeunload` + `baseHash` 乐观锁**：仅当存在未落盘的防抖写入时提示拦截；点击「保存变更」写回 `.feature` 前强制重算磁盘 `baseHash`，检测外部 `git pull` 或 Agent 修改时拒绝静默覆盖并引导三方校准。

### D2.3 `packages/core` 既有域模型增量对齐（向后兼容扩展）
C1 已落地基础单状态机纯域模型；为使 C3/C5 定稿体验零双份逻辑且 100% 可持久化，C3 在 `packages/core/src/studio/` 做以下 5 项向后兼容纯函数扩展（仍保持零 I/O、零时钟调用，并同步更新 zod schema）：
1. **5 类统一评论锚点**：`SemanticAnchor` 在既有 `machine | state | edge` 基础上扩充 `forest`（宏观规格卡）、`macro-edge`（全景连线）、`doc`（规则/决策文档）；
2. **评论全生命周期纯函数**：在 `revisions.ts` 补齐 `editStudioComment`、`reopenStudioComment`、`deleteStudioComment`，与前端统一就近评论浮窗 CRUD 一一对应；
3. **方言与 3 层嵌套元数据**：`StudioMachineIR` 增可选 `graphKind?: 'machine' | 'flow'`，`StudioStateNode` 增可选 `isGateway?: boolean`、`subMachineKey?: string`，支撑流程图 `F1–F4` Linter 与 3 层盒中盒嵌套持久化；
4. **乐观锁基线哈希**：`StudioStateDoc` 增可选 `baseHashes?: Record<string, string>`，承载 `preview-diff` 与「保存变更」前的外部改动冲突检测；
5. **净 Diff 边语义签名消元**：增强 `diff.ts` 的 `computeMachineDiff()`，对“删除原边后重建相同语义签名 `(from, to, event, guard)` 边”做语义对冲消元，避免因新旧 `uid` 不同产出假 `-1 / +1` 噪音。

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
3. **统一 `@xyflow/react` 渲染底座与避障互斥路由**：
   - 全站所有交互式节点图（主视图、状态机、流程图、决策树、世界线实时叠加对比）**统一复用 `@xyflow/react` 渲染与交互体系**（`obsidianmd/pele` 严格仅用于只读 Mermaid「变更依赖」图），确保拖拽、缩放、右键菜单与评论体验零割裂；
   - 初始排布使用 `elkjs`（`layered` 算法），跳过自环避免布局畸变；
   - 自定义 `StateEdge` 实现**自环弧、双向/平行边分离、避障通道路由（零穿卡）、边与标签互斥避让（零叠字/零共线）**，且支持人类按住连线标签直接拖拽微调弯曲弧度作为逃生舱。
4. **双层多叉「世界线」与真实画布 1:1 实时叠加对比**：
   - 宏观分支对应真实 Git Branches / Worktrees（复用 `proposal.md` 的 `branch`/`base_sha`）；微观分支为 `.llman-sdd/studio/states/` 中带 `parentId` 与 `actor: 'human' | 'agent'` 的非破坏多叉快照树；
   - 点击右上角「世界线」在**同侧右侧滑出抽屉**（绝不弹出全屏只读小图对比页）；点击任意历史节点的「与当前对比」，直接在左侧 **1:1 真实可交互画布**上实时叠加红绿差异（绿实框 `+新增`、琥珀色 `~调整`、红虚线幽灵 `-移除`），缩放、平移、右键留评论（含点击/右键已移除幽灵节点直接讨论）、编辑与分享深链 100% 保持一致体验。
5. **混合 `.feature` 容器、0-LLM 决策树双视图与验证硬度**：
   - `SpecDocCanvas` 兼容同一 `.feature` 同时包含 `Examples:` 真值表与多条 `Rule:` 条款的混合结构（提供文档内关键词检索与手风琴折叠）；
   - 决策表由纯函数 **0-LLM 确定性编译**为可交互决策树（`@xyflow/react`）+ 真值表 What-If 推演双视图；
   - 规则条款展示面向人类的 **4 级验证硬度徽标（`仅文档 / 已绑测试 / 防漂移 / 形式化`）**，对具备明显前置条件/状态流转结构的规则给出确定性「可转图结构 → 生成转图 Prompt」建议。
6. **双扩展插槽（`CanvasAdapter` + `SearchProvider`）**：
   - `CanvasAdapter`：C3 落地 `StateMachineCanvas`（状态机/流程图双图方言）、`SpecDocCanvas`（混合规则 + 0-LLM 决策树/真值表）与 `ChangeDagPanel`（`obsidianmd/pele`）；为 C5 主视图森林与多分组 Tab 预留统一槽位；
   - `SearchProvider`：全局 `⌘K` 与 `+ 新标签页` 共享同一组件，MVP 提供工作区实时规格 + 嵌套状态/步骤直跳 + 命令检索，并预留 `RAG 语义检索` Provider 插槽。

---

## D4 交互不变量、5 条 Studio Web 设计真言与认知一致性契约（经 Demo 实测定稿）

### D4.0 5 条 Studio Web 设计真言（落地为 `studio-web.feature` 可机检 Rule，后续所有 Change 必须遵循）
1. **触点同侧展开（Proximity Anchor）**：由工具栏或画布锚点唤起的抽屉/浮窗 MUST 从触发点同侧或就近展开，绝不横跨视口强迫视线折返（如右上角「世界线」→ 右侧展开，同时右下角小地图自动左让）。
2. **顶栏浮层单槽互斥（Single-Slot HUD Exclusivity）**：顶部中轴浮条为单一独占槽位，按优先级渲染（`世界线实时对比条 > 诊断/模式提示条 > 小贴士`），任意时刻严禁双条堆叠遮挡。
3. **默认连线零穿卡（Obstacle-Aware Edge Routing）**：默认布局与自动连线严禁从无关节点卡片背后直穿而过制造“伪串联”误解；跨行/跨列连线 MUST 经空闲走廊或避障路由绕行。
4. **连线与标签互斥 + 手拖微调（Edge & Label Mutual Exclusion + Manual Drag Override）**：双向/平行/跨区连线走廊与标签自动互斥排布（零叠字、尽量零交叉），同时支持人类直接按住连线标签拖拽微调弯曲弧度作为逃生舱。
5. **领域分组排他隔离（Exclusive Group Isolation）**：领域分组框按工作区严格隔离，其包围盒绝不允许误包非成员节点。

> **原型演示红线（`[DEMO-SIM]` Zero-Ship）**：交互原型中以 `[DEMO-SIM]` 隔离标注的模拟分叉/回执按钮仅供原型演示，生产版 `apps/studio/` 严禁合入任何模拟按钮，所有协作回执与分叉均由真实 CLI / HTTP / SSE 驱动，确保与端到端实测 100% 一致。

### D4.1 全站统一认知与极简约束
1. **极简单一查看模型（彻底去冗余窗口）**：
   - 砍掉只读「原地透视」、半屏只读分栏、全屏只读世界线小图对比页与自由悬浮编辑窗；
   - 全站统一为：**主视图卡片 → `进入 Tab`；嵌套复合节点 → `进入子图`**；需要并排看两张完整可编辑画布时直接浏览器多开窗口即可。
2. **全站统一 3 层交互契约（零重叠、零猜测）**：
   - **Hover（悬停）**：仅做只读路标（边框高亮、节点可拖端口圆点、tooltip、`Alt` 聚焦邻接），绝不弹破坏性按钮或大菜单；
   - **Left-Click（单击 / 双击）**：
     - 单击 = 干净选中（高亮选框与连线两端重连手柄，**无单选悬浮操作条，绝不自动弹出右侧大抽屉**；仅主视图框选 ≥2 节点时出批量「打包分组 / 建 Tab / 打 Tag」条）；
     - 卡片/节点显式主导航按钮（`进入 Tab` / `进入子图` / 评论数字气泡 `(N)`）左键直达；
     - 双击节点或连线（及选中按 `Enter`）= 就地编辑文字/事件（跨重绘防抖，主视图卡片禁止双击意外展开）；
   - **Right-Click（右键）**：**全站唯一的完整动作圆盘**（严格按主视图 / 状态机 / 流程图方言隔离，绝不重复卡片上已有的 `进入 Tab` / `进入子图`，统一提供 `留评论` 与 `分享状态` 入口）。
3. **全站统一就近评论浮窗（5 类锚点零差异心智）**：
   - 全站 5 类对象——**主视图规格卡（`forest`）、主视图连线（`macro-edge`）、状态/步骤节点（`state`）、下钻连线（`edge`）、规则/决策文档（`doc`）**——统一使用同一个可拖拽的**就近评论浮窗（Comment Popover）**；
   - **唯一心智入口**：任意画布节点/连线通过 **`右键 → 留评论`** 或直接左键点击对象上的**未解决评论数字角标 `(N)`** 唤起（规则/决策文档顶栏提供同等入口 `评论 (N)`），切换目标对象时自动重置浮窗位置紧贴当前指针/锚点并做视口防溢出；
   - **完整生命周期**：支持新增评论、就地行内编辑（`⌘+Enter` 保存 / `Esc` 取消）、标记解决 / 重新打开、删除；已解决评论自动移出 `(N)` 计数与默认协商 Prompt。
4. **盒中盒嵌套上下文 + 就近贴框面包屑**：
   - 下钻任意嵌套子状态机或子流程图时，外框自动呈现父层上下文，左右两侧动态投影父层真实的相邻前置/去向节点与带标签跨界箭头；
   - 嵌套面包屑（`[← 返回上层] 父图 › 子图 L2/L3`）直接贴合在外框顶部上沿，支持 `Alt+↑` 逐层返回。
5. **精简设置 SSOT、Scheme C 保存分流与去黑话文案**：
   - **克制减法**：正式移除左侧竖条工具栏（`#leftPalette`）、滚轮自动变更卡片密度（`autoLod`）与 MVP Tab 分组；左下视图栏仅保留缩放、**`重置视图`**、**`视图：图标 | 摘要 | 详情`** 与 **`画布`** 设置入口；
   - **`画布` 设置面板（唯一 SSOT，收敛为 4 组）**：① 皮肤 **2 套**（`Linear 冷静灰` / `和纸暖墨`）；② 连线 **3 种**（`曲线` / `圆角折线` / `直线`）；③ 界面开关 **2 项**（`小地图` / `图例筛选`）；④ 可选 **TextFold 外部服务**（`本地 AST` / 外部回环 URL）；
   - **Scheme C 统一草稿落盘分流**：4 类规格编辑态 100% 统一暂存本地草稿；点击底栏 **`保存变更`** 时，在非保护分支上纯文案微调（现有 BDD 全绿）允许直写 `.feature`，涉及语义/行为合约变更则走 **`生成调整 Prompt`** 交 Agent 同步代码与测试后再落盘；受保护主干分支弹三出口护栏向导；
   - **去黑话中文文案**：全站面向人类使用直觉文案——`主视图`、`原规格`、`生成调整 Prompt`、`仅文档 / 已绑测试 / 防漂移 / 形式化`（避免 `锁定意图`、`INTENT`、`BASE`、`L0–L3` 等内部黑话直出）；所有 Prompt 出口强制经过**可视化 Prompt 预编辑工作台（零盲复制）**。
6. **图方言隔离 Linter（绝不串规则）**：
   - 状态机：`STATE MACHINE LINTER`（`E1–E4 + W1–W2`）；流程图：`FLOWCHART LINTER`（`F1–F4`）；主视图拓扑：`TOPOLOGY LINTER`（`W3` 孤立规格节点）。

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
- 使用 MIT 开源 **`obsidianmd/pele`** 渲染同步 SVG 并通过 CSS 变量适配 2 套亮色皮肤（`Linear 冷静灰` / `和纸暖墨`）。

---

## 测试边界（Seam）

C3 的验收 seam 拆为三条互补边界：
1. **本地回环服务端 Seam（`tests/unit/studio-server/` 或 `tests/integration/`）**：起随机端口 `0` 的真实 `node:http` Studio 服务 + 临时仓库，验证 `/api/workspaces`、`/api/bootstrap`（含 `--demo` 自举模型与 `graphMermaid`）、`/p/:wsKey/*` 透明 HTTP `GET` 内容协商（浏览器 HTML + `studio-focus-context` vs 非浏览器默认 Markdown / `?format=json`）、`PUT /api/states/:id`（防抖原子写入与 `baseHash` 校验）、`/api/layouts/:machineKey`、`/api/textfold/fold`（本地 AST 折展 + 缓存命中 + 模拟外部 TextFold serve 转发与降级）、`/api/states/:id/revisions/:revId/accept`、`/api/states/:id/preview-diff`、`/api/states/:id/export-proposal`（产物过 `llman-sdd validate`）及 SSE 推送，并断言零直接写入 `llmanspec/specs/`。
2. **前端纯逻辑与几何不变量 Seam（`apps/studio/`）**：单测覆盖自举 3 层 `studio-web` 模型加载、双层多叉世界线（`parentId`/`actor` + 1:1 画布叠加 Diff 计算）、时间线净 Diff 语义对冲消元、子树脏状态冒泡、0-LLM 决策表→决策树编译与混合 `.feature` 容器、避障通道路由与边/标签互斥算法（断言 0 穿卡、0 叠字）、`SearchProvider` 工作区动态索引、方言隔离 Linter、5 类对象统一评论锚点格式化与 CRUD、`compileToXStateMachine` + 原生 `inspect` 步进与 `obsidianmd/pele` 渲染冒烟；构建验证 `rsbuild build`、`tsc --noEmit` 与全仓 `just qa` 全绿（并断言生产包不含 `[DEMO-SIM]`）。
3. **行为规格合约前置**：正式进入 C3 实施前，在 `llmanspec/changes/add-studio-web-workbench/specs/` 补齐 `studio-web.feature`（含自举 3 层状态机合约 + **5 条 Studio Web 设计真言可机检 Rule 块**）与 `monorepo-structure.feature` 增量规格，作为 `llman-sdd-verify` 验收基线；合并落地时在 `llmanspec/AGENTS.md` 补一行指针指向 `studio-web.feature`。
