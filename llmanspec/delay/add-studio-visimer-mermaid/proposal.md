---
depends_on:
  - add-studio-web-workbench
title: "[Post-MVP] 接入 Visimer 实现广义 Mermaid 图无损双向可视化编辑"
---

# 接入 Visimer 实现广义 Mermaid 图无损双向可视化编辑

## Why

C3 通过 `obsidianmd/pele` 解决了 `llman-sdd graph`「变更依赖」与提案内嵌 Mermaid 图的轻量只读实时渲染，并通过 `StateMachineCanvas` 提供了 `.feature` 表格驱动的状态机/流程图编辑。但仓库中的 `proposal.md`、`design.md` 及技术架构文档里还存在大量广义 Mermaid 流程图/架构图，目前只能手写源码预览、无法在画布上直接拖拽修改并无损写回原始 Mermaid 文本。

## What Changes

- **挂载 `CanvasAdapter` 双向 Mermaid 编辑器**：
  - 复用 C3 预留的 `CanvasAdapter` 插槽，引入 MIT 开源的 `inkeep/visimer`（`@visimer/react`），实现 Mermaid SVG 画布与源码 CST（具体语法树）的无损双向同步，保留原有注释、缩进与手工排版样式。
- **提案/设计文档内嵌 Mermaid 块编辑闭环**：
  - 支持在 Studio 中打开 `proposal.md` / `design.md` 里的 Mermaid 代码块进行可视化增删改节点与连线、预览行级 Unified Diff，并沿用 C3 的防抖草稿保存、统一就近评论浮窗与分支写保护护栏，不静默破坏原文档结构。
- **与只读 `pele` 清晰分工**：
  - `llman-sdd graph` 实时「变更依赖」只读视图继续使用零依赖的 `obsidianmd/pele` 保持极致轻量；需要交互式编辑广义 Mermaid 图时按需加载 Visimer 适配器。

## Capabilities

- `studio-web`：新增广义 Mermaid 双向可视化编辑 `CanvasAdapter`、文档内嵌代码块定位回写与行级 Diff 预览能力。

## Impact

- 依赖 `add-studio-web-workbench` 的 `CanvasAdapter` 扩展槽、草稿保存与写保护基础设施。
- 仅在前端包 `apps/studio/` 按需引入，不污染 `packages/core` 纯域依赖。

## Open Questions

- 首版支持的 Mermaid 图方言范围是否聚焦 `flowchart` / `graph`（优先覆盖提案与设计文档最高频场景），时序图/类图留待后续？
- `visimer` 的包体积与按需代码分割（dynamic import）策略，确保不影响默认状态机画布的首屏加载速度。
