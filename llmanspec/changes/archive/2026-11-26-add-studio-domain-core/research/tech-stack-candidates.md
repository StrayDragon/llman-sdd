# Studio 技术栈与可视化编辑器候选调研（待选型决策）

> 性质：候选技术栈与开源参考清册（**尚未最终锁定选型**，供后续专门的“技术栈决策环节”逐项对比拍板）。整理日期：2026-11-25。
> 仓库硬约束参照 `llmanspec/AGENTS.md`：运行时代码仅用 `node:` / Web 标准 API（兼容 Bun 与 Node `>= 24`）；Web 打包器为 `rsbuild`。

---

## 一、可视化画布 / 拖拽编辑器候选对比

这是整个 Studio 体验最关键的选型，按「底层画布框架」与「开源成品参考」两层罗列：

### 1.1 底层画布框架（4 个核心候选）

| 候选方案 | 核心范式 | 强项 | 短板 / 风险 | 适合本项目的哪一层？ |
| --- | --- | --- | --- | --- |
| **`@xyflow/react`**<br>*(React Flow / xyflow)* | 结构化节点图（每个节点即普通 React 组件） | 极易渲染红绿 Diff 徽章、守卫表单、评论气泡、E1–E4 标红与模拟高亮；生态成熟、社区最大；`@statelyai/graph` 原生支持互转 | 需自己接入布局引擎（`elkjs`）并编写自定义 Edge 处理**自环**与**同起止点多守卫平行边** | **MVP 状态机主编辑面首选候选**（L2 契约层最稳妥） |
| **`tldraw`** | 无限自由白板（内置状态机交互内核 + `ShapeUtil` 自定义图形） | 手感极顺滑（接近 Figma/Miro），天然适合「自由批注/圈画 + 结构化节点」混排；官方提供 AI Canvas 套件与多人同步 | 节点结构化表单比 React Flow 略重；需核查商业/去水印授权条款（MIT vs tldraw license） | **极强的备选 / L0–L1 混合白板候选**（若后续希望老板/产品在同一块白板自由圈画并下钻） |
| **`@excalidraw/excalidraw`** | 手绘风自由白板（支持元素 `customData`） | 人人熟悉、汇报审美友好；可借 `@excalidraw/mermaid-to-excalidraw` 单向导入 | **不宜作状态机证据/真理主编辑面**：① `customData` 无严格 schema 校验，用户复制/删文字极易弄断语义绑定；② Mermaid 转换是单向的，无法无损回写；③ 在上面做精细红绿语义 Diff、守卫编辑和 E1–E4 报错定位非常别扭 | **适合做 L0 脑暴草图或单向导出汇报图**，不建议承担严格状态机编辑与验证证据面 |
| **`@antv/x6`** | 企业级重型图编辑引擎 | 开箱即带复杂端口、正交路由、吸附对齐、BPMN 风格工具箱 | 体积和概念更重，与纯 React 声明式生态融合度不如 `@xyflow/react` | 仅当未来要深度做重型工业流程图/BPMN 时考虑 |
| **Obsidian 节点体系**<br>*(`d3-force` + PixiJS / WebGL + JSON Canvas 1.0)* | 宏观力导向星图（Graph View）+ 开放白板格式（`.canvas` / `jsoncanvas.org`） | **星图视图**：`d3-force` 物理聚类 + 权重圆点天然适合业务森林全景（中小型图可直接用 **`@xyflow/react` + `d3-force` 混合**实现同款手感并保留 React 交互；千级以上节点可再评估 PixiJS/WebGL）。**JSON Canvas 1.0**：极简开放 JSON 规范（`nodes`/`edges`/`group`），便于保存自定义 Tab 布局或导出给 Obsidian 打开 | 纯力导向星图会漂移抖动，**不适合直接做严格状态机编辑与红绿 Diff**（下钻后仍需切回确定性 `elkjs` 布局） | **宏观层（业务森林全景星图）& 自定义 Tab 视图存储/导出格式首选参考** |

### 1.2 开源可视化编辑器参考（重点借鉴与潜在集成）

| 项目 | 仓库 | 核心亮点与架构借鉴 | 对 `llman-sdd studio` 的参考价值 |
| --- | --- | --- | --- |
| **Visimer** | `inkeep/visimer` (`@visimer/core` / `@visimer/react`) | Mermaid 的所见即所得可视化编辑器；**通过把 SVG 元素映射回 CST（具体语法树）实现无损双向同步**，保留注释与格式，支持 22/23 种 Mermaid 图（含 flowchart、state、sequence、ER 等），且具备容错解析与统一 Undo/Redo | **未来广义 Mermaid 流程图阶段的重磅候选**；其「SVG/图操作 → CST 最小补丁」思想也极适合参考用于无损写回 `.feature` |
| **Stately Sketch** | `statelyai/sketch` (MIT) | `statelyai/xstate-viz` 已于 2024-02 归档只读；**`statelyai/sketch` 是官方 MIT 开源继任者**，支持 XState / JSON / YAML / Mermaid 输入，内置完整交互式状态机模拟（点事件、看守卫、追踪历史） | **状态机渲染与交互模拟的绝佳 MIT 开源源码参考** |
| **Mermaid Visual Editor** | `saketkattu/mermaid-visual-editor` | React + TS + `@xyflow/react` + Zustand + Mermaid 双向画布 | 参考 React Flow ↔ 文本格式双向同步的工程落地 |
| **Mermify** | `tra-sco/mermify` | React + TS + Bun + Monaco + 拖拽建节点（drag-to-create）双向同步 | 参考“从节点端口拖到空白处直接建新状态”的流畅交互与 Bun 技术栈实践 |
| **Mermaid Forge** | `russus87/mermaid-forge` | React + TS + React Flow，支持 subgraph 容器连带子节点整体拖拽 | 参考未来嵌套父状态（compound states）容器拖拽体验 |
| **Pele** | `obsidianmd/pele` (**MIT 开源**) | Obsidian 团队出品的超轻量 Mermaid SVG 渲染库：**零运行时依赖、同步渲染、通过 CSS 变量深度换肤**，兼容 Mermaid 12.1 语法（含 `flowchart`/`graph`、`stateDiagram-v2`、`sequence`、`er`、`gitGraph` 等） | **Studio 内实时渲染 `llman-sdd graph` Change 依赖 DAG 与 `proposal.md`/`design.md` 内嵌 Mermaid 图的首选轻量渲染器**（比引入完整 `mermaid.js` 轻且快一个数量级，且 MIT 许可无传染风险） |
| **Archify** | `tt-a1i/archify` *(Agent Skill)* | 非拖拽编辑器，而是**编译式 Agent 架构图生成 Skill**：强制 Agent 先产出强类型 JSON IR → 跑自动布局与可读性门禁（查交叉/遮挡）→ 生成带搜索、上下游追踪与 Git 文件/commit 证据的交互 HTML | **MVP 不硬塞**；其「Typed JSON IR + 校验门禁防模糊输出 + Git 源码证据绑定」模式极适合作为后续 **L3 源码按需投影**与反模糊扫描参考 |

---

## 二、图模型、布局、Diff 与模拟核心库候选

| 能力域 | 候选库 | 仓库现状 | 评估与备注 |
| --- | --- | --- | --- |
| **统一图 IR 与多格式桥接** | `@statelyai/graph` | **已安装 `^2.6.0`**（`packages/core`） | 隐藏王牌：纯 JSON `{ nodes, edges }`、支持嵌套节点与端口、内置 **8 种布局桥接**（ELK / Dagre 等）、**14 种格式互转**（含 React Flow / Mermaid / D2 / DOT）、以及 `@statelyai/graph/document` 基线更新模型 |
| **自动布局引擎** | `elkjs` *(首选候选)* vs `@dagrejs/dagre` | 均为 `@statelyai/graph` optionalPeers | `elkjs` 更擅长正交连线、复杂回环和嵌套父状态；`dagre` 更轻但对自环和平行边处理较弱 |
| **状态机语义 Diff** | **自研纯域引擎**（基于 `@statelyai/graph`）vs `jsondiffpatch` | 无现成完美库 | 市面无通用的“业务状态机红绿 Diff（含改名识别、守卫差异、忽略坐标）”现成库；通用 JSON diff 易因数组序误报。**建议在 `packages/core` 基于会话内 `uid` + 语义键自研 ~200 行纯域 Diff**，`jsondiffpatch` 最多作辅助 |
| **状态机模拟与 Trace 采集** | `xstate` 原生 `inspect` API *(首选)* vs `@statelyai/sdk/inspect` | `xstate@^5.33.4` **已安装** | XState 原生 `createActor(machine, { inspect })` 零额外依赖、不走外部云端 relay，既可用于 Studio 内“单步点击试跑状态机”，也可 15 行代码导出跨语言 JSONL Runtime Trace |
| **前端状态与撤销重做** | `zustand` + `zundo` | 待引入（前端） | `@xyflow/react` 内部已用 Zustand；加几 KB 的 `zundo` 即可让画布天然拥有 Ctrl+Z / Ctrl+Y |
| **Unified Diff 生成与应用** | `diff` (`jsdiff >= 8.0.3`) | 待引入（`packages/core`） | BSD-3-Clause、零运行时依赖、内置原生 TS 类型；提供 `createTwoFilesPatch` / `applyPatch` / `parsePatch` / `reversePatch`，零 Git 依赖且 100% 兼容 `git apply` 与 `patch -p1`。**必须锁定 `>= 8.0.3` 以免疫 CVE-2026-24001** |

---

## 三、MCP、本地服务与远期形式化验证候选

| 能力域 | 候选库 / 工具 | 兼容与评估 |
| --- | --- | --- |
| **MCP Server 协议层** | `@modelcontextprotocol/sdk` | 官方 TS SDK，兼容 Bun 与 Node `>= 24`，直接复用本仓 `zod@^4`；支持 `StdioServerTransport`（MVP 兼容性最广）与新版 `Streamable HTTP` |
| **本地 HTTP / SSE 服务** | `node:http`（零依赖）vs `hono`（纯 Web Standard） | `node:http` 最轻且 0 新增依赖；若后续需一套代码优雅承载静态资源 + SSE + Streamable HTTP MCP，`hono` 对 Bun/Node 24 双兼容非常干净 |
| **远期形式化验证（L3）** | **Quint** (`@informalsystems/quint`) vs TLA+ vs Lean 4 | Quint 底层为 TLA+ 数学语义，但语法酷似 TypeScript、编译器本身是 TS，且原生输出 JSON Trace（`.itf.json`）可驱动任意语言测试，工程落地成本显著低于原生 TLA+ / Lean |

---

## 四、后续“技术栈拍板环节”建议验证清单

在正式进入 `design.md` 之前，建议用极小验证实验拍板以下 4 件事：

1. **画布主路线二选一**：MVP 状态机是锁定 `@xyflow/react + elkjs`，还是评估 `tldraw` 混合白板（核查授权与表单交互成本）？
2. **Mermaid 扩展路线**：后续广义流程图是通过 `@statelyai/graph` 的 Mermaid 适配器统一画在 `@xyflow/react` 上，还是直接嵌入 `inkeep/visimer`（`@visimer/react`）作为独立视图模式？
3. **`@statelyai/graph` 实测**：实地核查本仓已装 `v2.6.0` 的子路径导出（`elk`、`mermaid`、`reactflow`、`document`），确认哪些能力可直接零成本复用。
4. **`@modelcontextprotocol/sdk` 与 `zod@^4` 兼容性实测**：确认官方 MCP SDK 当前版本与本仓 `zod@^4.6.7` 的类型兼容情况。
