---
depends_on:
  - add-studio-domain-core
title: 落地 Studio Web 单状态机交互工作台与实时依赖图视图
---

# 落地 Studio Web 单状态机交互工作台与实时依赖图视图

## Why

人类在纯文本 `.feature` 表格和命令行 Mermaid 输出上难以高效把握复杂状态流转与多 change 依赖关系。需要一个本地运行、低认知负担的 Web 控制面，让人类通过直观的拖拽改图、红绿语义 Diff、图元评论、单步试跑与实时依赖图审视来主导业务意图演进，而不是陷入具体实现代码或满屏杂乱控件。

## What Changes

- **Web 工程底座（`apps/studio/`）**：按 `llmanspec/AGENTS.md` 约定使用 `rsbuild` + React + TypeScript，采用现代低认知负担前端架构（Zustand + `zundo` 单一状态库、TS 判别联合类型约束 5 态 UI、坐标与领域数据冷热拆表、3 层防丢态自动保存、Tailwind CSS v4 + 无头原语 + 共享 `SearchProvider` 的 `⌘K` 与 `+ 新标签页` 并预留 RAG 语义检索槽位）。
- **自举 3 层 `studio-web` 模型与双图方言交互画布**：`studio-web` 作为首个全面拥抱本系统的自举规范样例（3 层盒中盒嵌套状态机，0 错 0 警），同时完整支撑状态机 / 流程图 / 决策真值表 / 规则文档 4 类规格闭环（0 状态表仓库默认提供友好空态引导与 `--demo` 内置自举样例）；采用极简单一纯画布 + Tab 模型、`elkjs` 布局与手拖坐标独立持久化、自环/平行边分离、时间线 `BASE→HEAD` 净 Diff 语义对冲消元与子树脏状态冒泡。
- **全站统一 3 层交互契约、统一就近评论浮窗与方言隔离 Linter**：严格区分 Hover（只读路标）/ Left-Click（干净选中与跨重绘双击就地编辑）/ Right-Click（唯一方言动作圆盘）；所有 5 类对象（全景节点、全景连线、状态/步骤节点、下钻连线、规则/决策文档）共享同一个可拖拽的**就近评论浮窗**（统一经 `右键 → 留评论` 或点 `(N)` 角标唤起，支持新增 / 就地编辑 / 解决与重开 / 删除），右侧抽屉严格收口为 `对比 & 协商`；配套状态机（`E1–E4 + W1–W2`）与流程图（`F1–F4`）独立 Linter、TextFold 双层语义折展（内置 0-Token AST 兜底 + 可选外部 TextFold serve 代理转发）、全产品零盲复制 Prompt 预编辑工作台以及底栏「保存变更」分支写保护三出口向导。
- **实时 `llman-sdd graph`「变更依赖」侧栏视图**：在 Studio 内提供只读、可拖拽、可独占全屏的实时「变更依赖」视图（自动反映 `llmanspec/changes/` 下的 `depends_on` 变更），采用 MIT 开源零运行时依赖的 **`obsidianmd/pele`** 直接同步渲染 Mermaid SVG 并支持 4 套亮色皮肤适配。
- **本地按需单实例 Hub 与实时联动**：`llman-sdd studio open / serve --foreground / stop` 启动本地回环服务（`127.0.0.1`），复用 `discoverRoots()` 实现多仓 / 多 Worktree / 子项目 `llmanspec/` 隔离，通过 SSE 实时同步 `llmanspec/` 变更以及 Agent 经 CLI/MCP 写回 `.llman-sdd/studio/states/` 的评论回复与虚线红绿修订建议。

## Capabilities

- `studio-web`（新增，待 propose 阶段建 spec）：定义单状态机画布、5 态交互、红绿 Diff、锚定评论、`--demo` 空态、Change 依赖 DAG 实时视图与导出行为。
- `monorepo-structure`：按 `llmanspec/AGENTS.md` 正式纳管 `apps/studio`（rsbuild）至 monorepo 门禁。

## Impact

- 依赖 `add-studio-domain-core` 的纯域图 IR、语义 Diff 与会话格式。
- 刻意将“多 Tab 业务森林 + 宏观星图下钻”拆至后续 `add-studio-forest-tabs`，保证首版工作台聚焦且体验地道。

## Open Questions

全部核心决策已收敛并写入同目录 [design.md](./design.md)：

- **前端主技术栈**：锁定 `@xyflow/react` + `elkjs` + `zustand`/`zundo` + Tailwind CSS v4 + `cmdk`（全 MIT）；只读 Mermaid 实时渲染（`llman-sdd graph` Change 依赖 DAG 及提案内嵌 Mermaid 图）采用 **`obsidianmd/pele`（MIT，零运行时依赖）**；后续广义 Mermaid 流程图的可视化双向编辑锁定 **`inkeep/visimer`（`@visimer/react`，SVG → CST 无损双向同步）** 作为首选集成方案，C3 前端视图层预留对应 `CanvasAdapter` 插槽。
- **静态托管与本地服务**：`rsbuild build` 产出静态 `apps/studio/dist/`，由 `apps/cli` 内置轻量 `node:http` 回环服务（`127.0.0.1`）统一托管静态资源 + `/api/*` + SSE 文件监听；开发期用 `rsbuild dev` 代理 `/api/*`。
- **单步试跑态（`Simulate`）驱动**：在 `apps/studio` 前端引入 `xstate` 运行时与原生 `inspect` API（不回流污染 `packages/core` 依赖），将 `StudioMachineIR` 编译为可交互 actor，配合守卫真假开关单步试跑并记录微步轨迹，为后续嵌套父状态/并行区留好演进底座。
- *实施期冒烟项*：安装 `obsidianmd/pele` 时现场确认其具体 npm 包导出形态与 `llman-sdd graph` 输出兼容性（写入 T5 验收标准）。
