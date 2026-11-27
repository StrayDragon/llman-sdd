# Design: 多工作区隔离全景森林、领域分组框选与多 Tab 视图

本设计锁定 `add-studio-forest-tabs`（C5）的空间模块化导航、纯域森林投影、领域分组框选建 Tab、多工作区零串味隔离与上下文边界保留。核心原则：**只做对已有 `llmanspec/` 设施的双向语义映射，不引入外部工具（`.canvas`/Excalidraw 等）导出负担**，确保人类看图与 Agent 读规格始终同源、省 Token。

---

## D1 宏观业务森林纯域投影（`packages/core/src/studio/forest.ts`）

新增纯函数 `buildForestGraph(entries: readonly SpecEntry[]): ForestGraph`（零 I/O、0 Token、100% 源自真实 `llmanspec/specs/`）：

- **4 类规格节点（`ForestNode`）**：
  - 每个 capability（`.feature`）按内容语义归类为 `machine`（状态机）、`flow`（流程图）、`decision`（决策表）、`doc`（规则文档），主键直接复用 `specIdOf(entry)`；
  - 节点权重 `weight` 由 `ruleCount + scenarioCount * 0.5 + machineCount * 3` 计算，用于映射视觉层级；
  - 节点携带当前工作区真实 `tags[]` 与纳管图清单 `machineKeys[]`，通过卡片显式 **`进入 Tab`** 按钮展开完整编辑画布（禁止双击卡片误触展开，保持全站交互契约一致）。
- **自动实线（`ForestEdge`，`kind: 'spec-ref'`）**：
  - 复用既有 `buildReqRegistry(entries)` 反查规则正文中的 `@req:<id>` 跨能力引用；
  - 扫描跨状态机/流程图共享的命名与显式能力引用；
  - 每条自动实线携带 `evidence: Array<{ sourceReqId?: string; targetReqId?: string; summary: string }>`，支撑外部契约门户预览与交叉桥分析。

---

## D2 浏览器级多 Tab 视图、领域分组框选与工作区隔离（`.llman-sdd/studio/views.json`）

- **极简浏览器级 Tab 栏**：默认仅开启 1 个置顶 **`📌 全景`** Tab（低认知负担起步），其余自定义 Tab 全部可关闭；右键任意 Tab 可置顶/取消置顶、关闭其他或恢复默认；点 **`+`** 或全关闭进入按当前工作区动态生成的「快速引导页」（动态汇总当前工作区真实规格与 `#tag (count)`，绝不硬编码跨仓标签，且过滤命中 0 节点时展示清晰空态恢复卡而非白屏）；
- **双向视图历史（`‹ / ›`）**：复用 C3 左上角对称 `‹ / ›`（`Alt+← / Alt+→`）导航历史，覆盖全景、自定义分组 Tab、规格 Tab 与 3 层嵌套下钻；
- **领域分组框选与自定义 Tab**：
  - 画布支持 **`Shift + 左键拖框`**（或左侧工具条切换框选工具 `V`）批量框选多个规格卡片，上方弹出唯一批量操作条：**`打包分组 (G)`**、**`新建 Tab 视图 (T)`**、**`打 Tag`**；
  - 领域分组容器（`.group-frame`）严格置于**最低视觉层级（`z-index: 0`，低于连线与卡片）**，支持整组拖拽、折叠收敛为簇卡片、双击重命名与一键生成专属 Tab；
  - 自定义领域 Tab 底栏提供 **`+ 显示外部 1 跳接口`** 开关，按需带出跨组依赖节点而不污染核心视角；
- **大图「聚焦邻接」（1 跳过滤）**：节点数超过阈值的大图视角默认开启「聚焦邻接」，仅显示当前焦点规格及直接上下游邻接节点，其余收进 `+ 展开其余 N 个非邻接节点` 按钮；
- **本地视图文件 `<instanceRoot>/.llman-sdd/studio/views.json`**（默认 `.gitignore`，按 `llmanspec/` 实例严格隔离，不污染 Git 与 `llmanspec/specs/`）：
  ```ts
  export interface StudioTabView {
    id: string;
    title: string;
    pinned?: boolean;
    /** 空数组表示默认全景；非空时仅展示所选业务能力子集 */
    includedCapabilities: string[];
    /** 按 #tag 过滤的动态视角 */
    tagFilter?: string | null;
    /** 自定义子集 Tab 是否展开外部 1 跳接口 */
    showExternalHops?: boolean;
    /** 是否开启“只看交叉桥”过滤 */
    bridgeOnly: boolean;
    /** 人类在本地拉的辅助参考虚线（仅视图笔记，绝不写入 specs） */
    manualLinks: Array<{ id: string; fromCap: string; toCap: string; label?: string }>;
    /** 本地领域分组容器（支持折叠与整组拖拽） */
    manualGroups: Array<{ id: string; title: string; tone?: string; capabilities: string[]; collapsed?: boolean }>;
    /** 宏观画布手拖锁定后的节点坐标 */
    macroPositions: Record<string, { x: number; y: number }>;
  }
  ```
- 后端复用 C3 本地回环服务扩展 `GET /api/views` 与 `PUT /api/views`（防抖自动保存 + 临时文件原子 `rename`），并通过现有 SSE 通道同步刷新；
- **明确不做**：不在 C5 实现原地只读透视浮层、半屏只读分栏、自由悬浮编辑窗或 Obsidian `.canvas` / Excalidraw 外部格式导出，坚持单一纯画布 + Tab 极简模型。

---

## D3 宏观拓扑画布 ↔ 盒中盒上下文下钻

复用 C3 预留的 `CanvasAdapter` 插槽，新增 `ForestMacroCanvas` 与全景拓扑 Linter（`W3` 孤立规格提醒）：

1. **宏观拓扑画布**：
   - 初始排布使用 `d3-force`（`forceLink` + `forceManyBody` + `forceCollide`）做**一次性预计算静置排布**（不持续物理抖动），已有 `macroPositions` 的节点严格尊重人类手拖坐标；
   - 自动实线（规格引用）与人工参考虚线明确区分；左键单击仅选中（无自动侧栏、无单选浮条），右键圆盘负责编辑、评论与组织（卡片：`重命名` / `留评论` / `加入多选或打包 N 项` / `删除规格`，绝不重复卡片上的 `进入 Tab`；连线：`改标签` / `反转方向` / `转实/虚线` / `留评论` / `删除连线`），节点与连线同步显示未解决评论 `(N)` 角标直达 C3 统一就近评论浮窗；空白画布右键提供 4 类新建 + `贴便签` + `重置视图`；
   - 拖拽卡片端口圆点至空白处松手弹出 5 选 1 选建圆盘（状态机 / 流程图 / 决策表 / 规则 / 便签）。
2. **上下文边界保留（Boundary Portals）与外部契约联动**：
   - 进入状态机或流程图 Tab 后，外框左右两侧自动渲染当前规格关联的**外部上游约束 / 下游契约门户**与跨界虚线；
   - 点击外部契约门户弹出就近轻量预览卡片，展示交叉 `evidence[]`，并提供 **`新 Tab 打开`** 与 **`回到全景`** 双动作（右键菜单同步提供一致路由）；
   - 进入嵌套第 2/3 层子图时，左右两侧无缝切换为 C3 的**盒中盒真实父层相邻节点投影**。

---

## D4 跨森林交叉桥高亮（Cross-Forest Bridge）与全局搜索联动

- 当自定义组合 Tab 包含 `>= 2` 个领域分组时，底栏按需显示「交叉桥」开关：
  - 纯函数 `computeCrossForestBridges(graph, groups)` 识别横跨不同领域分组的自动实线与边界节点；
  - 开启后，组内非桥接节点与边淡化至 `opacity: 0.2`，高对比点亮跨领域契约连线，并支持右键挂锚定评论汇入统一协商闭环；
- 与 C3 `SearchProvider` 联动：在全景与 `+ 新标签页` 中按工作区实时搜索全部规格、领域分组与 `#tag`，并为后续 RAG 语义检索保留统一检索结果跳转契约。

---

## 测试边界（Seam）

C5 的验收 seam 分为纯域与前后端集成两层：
1. **纯域森林与交叉桥 Seam（`tests/unit/studio/forest.test.ts`）**：构造含 4 类规格与跨能力 `@req:rXX` 引用的夹具，验证 `buildForestGraph` 分类与权重、`evidence` 提取、`computeCrossForestBridges` 交叉边过滤、`W3` 孤立节点检查与 `views.json` zod 校验；
2. **服务端与前端交互 Seam**：随机端口测试 `GET/PUT /api/views` 按工作区实例隔离原子读写；前端单测覆盖默认单 Tab 启动、多工作区 `+ 新标签页` 动态标签聚合、零匹配空态兜底、`Shift+拖框` 批量分组/建 Tab、1 跳外部接口切换、焦点邻接过滤、外部门户预览与 `d3-force` 静态初始化无 NaN 坐标，最后验证 `rsbuild build` 与全仓 `just qa` 全绿。
