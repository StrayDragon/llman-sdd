# 双向状态图编辑器与 SSOT 架构调研

> 性质：选型与架构分析材料，不是行为合约。整理日期：2026-11-25。外部产品能力仅记一手来源里可核对的事实；本仓结论均对照真实源码核验。

---

## 1. 背景与原初痛点

开发者常用 Excalidraw、Mermaid、Project Graph 画状态图或流程图，交给编码 agent 做出第一版；但后续需求迭代时，实现代码与图迅速分开走。

最初的目标是做一份「能双向改、能按层级缩放的网页编辑器」，并明确了两条底线：
1. **普通 BDD 场景不转成节点**，只有严格标明的状态机进图。
2. **语义模型只有一份**，图和文字都是它的投影；节点坐标另存，不进语义。

---

## 2. 本仓现有状态机语义基础

本仓已经具备严格的状态流转语义与门禁实现，位于 `packages/core/src/validation/xstateTransitions.ts`：

- **数据来源**：`.feature` 场景大纲中的 `例子:`（Examples）表，列族为 `from/初始状态`、`event/事件`、`to/目标状态`，以及可选 `guard/守卫`。
- **发现规则**：
  - `@transitions`：强制纳管（残缺表由 E1 拦截）。
  - `@no-transitions`：完全豁免（两标签同挂判 ERROR）。
  - 无标签时：表头命中 `from / event / to` 三族中至少两族即自动识别。
- **四道零逃逸 ERROR 门禁**（基于 `xstate` 与 `@statelyai/graph`）：
  - **E1**：表结构完整（必填列、非空、去重状态数 ≥ 2、runnable）且 Given/When/Then 步骤分别绑定 `<from>` / `<event>` / `<to>`（及有守卫时的 `<guard>`）。
  - **E2**：确定性——同一 `(from, event, guard)` 不得重复或指向不同目标状态。
  - **E3**：可达性——所有状态必须从首行初始状态可达。
  - **E4**：无死锁/陷阱——存在终态（出度为 0）时，所有非终态必须能到达至少一个终态；不存在终态时，所有状态必须能回到初始状态。
- **现状核查**：当前 `llmanspec/specs/` 下共 14 份规格文件，其中仅有 1 张正式状态流转表（`change-lifecycle.feature` 中的「stage 状态机单调迁移表」，4 个状态、3 条转移）。

---

## 3. 已有产品与工具的源模型对比（一手核查）

| 产品 / 库 | 底层源模型 | 对本仓的启发与局限 |
| --- | --- | --- |
| **Stately / XState** | 机器定义文件（`.json`/`.jsonc`/TS）。`statelyai open` 双向同步，默认 `preserve` 保留格式与注释；`statelyai diff` 忽略实体 ID、布局和颜色，CI 可用 `--fail-on-changes` 只卡语义。XState 嵌套 `states`（如 `{ red: 'walk' }`）表达图内语义下钻。 | **最值得借鉴的架构模式**：布局旁路、语义 diff 不看坐标、结构化同步。但公开单文件写回主要覆盖 XState JSON/JSONC，且本仓真源是 Gherkin 契约而非手写 XState 源码。 |
| **Excalidraw** | 场景 JSON（`type`: rectangle/text/arrow、几何与样式、`id` 为不透明标识、`customData` 无模式）。 | 没有状态、事件、转移的原生语义；适合作为后续广义草图或导出目标，不宜作状态机真源。 |
| **Mermaid Live Editor** | 图文本（`inputState` 存代码，经 `mermaid.parse` 渲染）；编辑面为 Monaco/CodeMirror，非拖拽写回。`stateDiagram-v2` 支持复合状态 `{ }`，但不支持跨复合状态内部连线，复合状态 `classDef` 受限。 | 仍是独立图文本，缺乏与业务测试的可执行绑定；后续可作为广义流程图的导入/导出适配器。 |
| **Project Graph** | `.prg`（ZIP 内的 `metadata.msgpack` 与 `stage.msgpack`），定位为头脑风暴、知识整理与项目规划的无限画布。 | 节点、分组和连线无状态机模式；可借鉴其信息组织体验，但不宜作状态机语义源。 |
| **xyflow（React Flow）** | 前端交互画布库，支持几何缩放、`parentId` 子流与 Contextual Zoom（按缩放比例切换节点呈现细节）。 | 适合作为本仓 Studio 前端画布引擎；注意 `parentId` 只是布局父子关系，语义层级仍需由领域模型定义。 |

---

## 4. 首轮原型复盘：为什么早期临时 Demo 没有达到预期

在探索期曾快速搭建过一版临时 `apps/studio/` 原型（现已清理），复盘其未能达到预期的 4 个结构性原因，作为正式设计的反面教材：

1. **违背了“普通 BDD 不进图”的原则**：将全部 `.feature` 的 `功能 → 规则 → 场景` 全量铺成巨型嵌套卡片墙，导致唯一一张真实状态机被淹没在百余个普通规则方块中。
2. **伪双向编辑**：画布禁用拖拽与连线（`nodesDraggable={false}`、`isValidConnection={() => false}`），实际退化为“只读图 + 右侧整文件 `<textarea>` 手改原文”。
3. **未复用 core 领域引擎**：前端另写正则解析 `.feature`，丢失了 `@transitions`/`@no-transitions`、`guard` 列与 E1–E4 实时诊断，且状态被硬排成一字长蛇阵，无法表达真实状态图拓扑。
4. **越过 SDD Change 生命周期**：原型直接 `PUT` 覆盖 `llmanspec/specs/*.feature`，违背默认分支 `specs/` 只读与经由 `change` 审阅合入的纪律。

---

## 5. 核心架构研判：SSOT、漂移与分层双源

### 5.1 画布 Diff → 协商 → Change 是否违背 SSOT？

**不违背。**
- `llmanspec/specs/` 是已生效的唯一真理；
- Studio 中的编辑与红绿语义 Diff 是**未落盘的暂存增量（Staging Delta）**，类似于 Git working tree diff；
- 经人类与 Agent 核验一致后落入 `llmanspec/changes/<id>/`，再经 `change archive` 原子合入 `specs/`。整个生命周期里不存在两份长期并行演进的真理。

### 5.2 为什么不能把「项目源码」作为唯一 SSOT 来反向生成全部规格与图？

如果放弃 `llmanspec/`，每次从源码反向抽图：
1. **失去判定标尺（Oracle Problem）**：当 Agent 写错守卫或偷偷绕过状态校验时，反向生成的图会把错误实现忠实画出来，人类无法借助独立真理发现 Agent 偏离意图。
2. **Round-trip 不可逆**：通用业务源码中的隐式状态（分散在条件判断、数据库字段、异步回调里）既难以无损抽取，更无法把画布修改稳定写回任意风格的源码。

### 5.3 破局方案：分层双源 + 可执行契约绑定

将“大到产品/架构、小到代码逻辑”的需求按层级拆清 SSOT：
- **业务意图 / 架构关系 / 状态机与形式化不变量（L0–L2）**：SSOT 在 `llmanspec/`，由人类主导；通过保持极薄（不写代码实现细节）+ **可执行绑定（BDD 测试逐行驱动源码 + XState / 形式化校验）**杜绝静默漂移。
- **具体代码实现逻辑（L3）**：SSOT 在项目源码本身，不维护手工文档；需要下钻查看时按需从源码自动投影。

---

## 6. 一手参考来源

- Stately CLI / Editor Sync：https://stately.ai/docs/packages/cli
- Stately SDK（diff、push/pull、嵌入、导出）：https://stately.ai/docs/packages/sdk
- XState v6 双向编辑声明：https://stately.ai/blog/2026-11-05-xstate-v6-beta
- XState 嵌套状态：https://github.com/statelyai/xstate/blob/main/packages/core/README.md
- VS Code 扩展支持的文件类型：https://marketplace.visualstudio.com/items?itemName=statelyai.stately-editor
- Excalidraw JSON schema：https://github.com/excalidraw/excalidraw/blob/master/dev-docs/docs/codebase/json-schema.mdx
- Mermaid 状态图语法与复合状态限制：https://mermaid.js.org/syntax/stateDiagram.html
- Mermaid Live Editor 以代码为状态：https://github.com/mermaid-js/mermaid-live-editor/blob/develop/CLAUDE.md
- Project Graph 与 PRG：https://github.com/graphif/project-graph 与 https://graphif.dev/docs/spec/prg
- xyflow 子流：https://reactflow.dev/learn/layouting/sub-flows
- xyflow Contextual Zoom：https://reactflow.dev/examples/interaction/contextual-zoom
- 本仓状态流转门禁实现：`packages/core/src/validation/xstateTransitions.ts`
