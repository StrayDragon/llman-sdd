# Design: 多 Tab 业务森林组合、宏观星图与边界保留下钻

本设计锁定 `add-studio-forest-tabs`（C5）的空间模块化导航、纯域森林投影、多 Tab 本地视图与上下文边界保留下钻机制。核心原则：**只做对已有 `llmanspec/` 设施的双向语义映射，不引入外部工具（`.canvas`/Excalidraw 等）导出负担**，确保人类看图与 Agent 读规格始终同源、省 Token。

---

## D1 宏观业务森林纯域投影（`packages/core/src/studio/forest.ts`）

新增纯函数 `buildForestGraph(entries: readonly SpecEntry[]): ForestGraph`（零 I/O、0 Token、100% 源自真实 `llmanspec/specs/`）：

- **业务节点（`ForestNode`）**：
  - 每个 capability（`.feature`）映射为一个宏观圆球，主键直接复用 `specIdOf(entry)`（双向对齐 `llmanspec/specs/`）；
  - 节点权重 `weight` 由 `ruleCount + scenarioCount * 0.5 + machineCount * 3` 计算，用于映射星图圆球半径，让眼睛一眼分清核心业务与边缘支撑；
  - 节点内挂出该能力下纳管的状态机清单 `machineKeys[]`，双击即可精准下钻。
- **自动实线（`ForestEdge`，`kind: 'spec-ref'`）**：
  - 复用既有 `buildReqRegistry(entries)` 反查规则正文中的 `@req:<id>` 跨能力引用（例如 `config-schema` 引用 `validation` 的 `@req:r104`）；
  - 扫描跨状态机共享的状态/事件命名与显式能力引用；
  - 每条自动实线携带 `evidence: Array<{ sourceReqId?: string; targetReqId?: string; summary: string }>`，支撑下钻外围气泡预览与交叉桥分析。

---

## D2 浏览器级多 Tab 视图切片（`.llman-sdd/studio/views.json`）

- 顶部固定轻量浏览器级 Tab 栏：`[ 📌 全景 ]` `[ 自定义组合 1 × ]` `[ 自定义组合 2 × ]` `[ + ]`（除置顶记忆标签外全部可关闭，右键可置顶/关闭其他/恢复默认；点 `+` 或全关闭进入空白快速引导视图；按 `llmanspec/` 实例隔离持久化，零跨仓串 Tab）；
- **三层浏览/编辑协同**：支持在全景卡片**原地只读透视**（多级嵌套下钻 `L0→L4` 与实时镜像同步）、就近弹出**可最小化悬浮编辑窗**，或进入**独立新 Tab**（带悬浮 `← 返回原 Tab` `Alt+←` 与 `收为悬浮窗` 胶囊）；
- **大图「聚焦邻接」（1 跳过滤）**：节点数超过阈值的大图视角默认开启「聚焦邻接」，仅显示当前选中规格及其直接上下游邻接节点，其余无关节点收进「+ 展开其余 N 个节点」按钮，避免大图连线 spaghetti 压迫视觉。
- 本地视图文件 `<instanceRoot>/.llman-sdd/studio/views.json`（默认 `.gitignore`，不污染 Git 与 `llmanspec/specs/`）仅存轻量视图投影：
  ```ts
  export interface StudioTabView {
    id: string;
    title: string;
    /** 空数组表示默认全景（包含全部能力）；非空时仅展示所选业务森林子集 */
    includedCapabilities: string[];
    /** 是否开启“只看交叉桥”过滤 */
    bridgeOnly: boolean;
    /** 人类在本地拉的辅助参考虚线（仅视图笔记，绝不写入 specs） */
    manualLinks: Array<{ id: string; fromCap: string; toCap: string; label?: string }>;
    /** 本地视觉分组框 */
    manualGroups: Array<{ id: string; title: string; capabilities: string[] }>;
    /** 宏观星图手拖锁定后的节点坐标 */
    macroPositions: Record<string, { x: number; y: number }>;
  }
  ```
- 后端复用 C3 本地回环服务扩展 `GET /api/views` 与 `PUT /api/views`（同样走临时文件 + 原子 `rename`），并通过现有 SSE 通道同步刷新。
- **明确不做**：不在 C5 实现 Obsidian `.canvas`、Excalidraw 或 Project Graph 外部格式导出，保持核心数据模型精简聚焦。

---

## D3 宏观星图（`d3-force`）↔ 微观状态机（`elkjs`）上下文下钻

复用 C3 预留的 `CanvasAdapter` 插槽，新增 `ForestMacroCanvas` 与面包屑下钻容器：

1. **宏观层（星图视图）**：
   - 使用 `d3-force`（`forceLink` + `forceManyBody` + `forceCollide`）做**一次性预计算静置排布**（不持续物理抖动），已有 `macroPositions` 的节点尊重人类手拖坐标；
   - 自动实线与人工参考虚线以视觉线型明确区分（实线 = 规格事实，虚线 = 人类个人标注）；
   - 未点击任何节点时右侧保持留白；点击圆球右侧才滑出操作栏（查看该能力规则摘要、状态机入口、添加参考虚线或下钻）。
2. **上下文边界保留下钻（Boundary Portals）**：
   - 双击圆球进入下钻栈 `drillPath`（顶部 Tab 下方显示一行极简面包屑：`全景 > 业务 A > 订单审批流转`，点任意层级一键返回）；
   - 主区域无缝切换为 C3 的确定性 `StateMachineCanvas`（`elkjs` 排布 + 5 态 UI + 红绿 Diff + 评论 + 试跑）；
   - 容器外围自动渲染与当前业务相连的**外部邻居气泡与出入箭头**（依据 `ForestGraph.edges` 中进/出当前能力的邻居生成）；
   - 点击外部邻居气泡**不直接跳转打断思路**，先弹出轻量预览卡片显示交叉 `evidence[]`，再由人类点击「拉入当前 Tab 对比」或「跳过去查看」。

---

## D4 跨森林交叉桥高亮（Cross-Forest Bridge）

- 当自定义组合 Tab 选入 `>= 2` 个业务森林时，画布顶栏显示「只看交叉桥」开关：
  - 纯函数 `computeCrossForestBridges(graph, groups)` 识别横跨不同森林分组（或不同所选能力间）的所有自动实线与涉及的边界节点；
  - 开启后，各森林内部非桥接节点与边自动淡化至 `opacity: 0.2`，高对比点亮交叉桥连线；
  - 人类可直接点击交叉桥挂锚定评论（锚定到对应能力/规则），无缝流入 C1/C2/C3 同一套 Prompt / CLI / MCP 协商闭环。

---

## 测试边界（Seam）

C5 的验收 seam 分为纯域与前后端集成两层：
1. **纯域森林与交叉桥 Seam（`tests/unit/studio/forest.test.ts`）**：构造多 `.feature` 夹具（含跨能力 `@req:rXX` 引用与共享状态机事件），验证 `buildForestGraph` 权重计算、自动实线 `evidence` 提取、`computeCrossForestBridges` 交叉边过滤与 `views.json` zod 校验；
2. **服务端与前端交互 Seam**：随机端口测试 `GET/PUT /api/views` 原子写盘；前端单测覆盖 Tab 增删切、面包屑下钻/返回栈、边界邻居气泡计算（点击预览不误跳）与 `d3-force` 静态初始化无 NaN 坐标，最后验证 `rsbuild build` 与全仓 `just qa` 全绿。
