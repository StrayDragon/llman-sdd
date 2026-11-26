---
depends_on:
  - add-studio-web-workbench
title: 扩展多 Tab 业务森林组合、宏观星图与边界保留下钻
---

# 扩展多 Tab 业务森林组合、宏观星图与边界保留下钻

## Why

当项目规模增长到数十个能力与多个业务模块时，人类不仅需要审视单张状态机，还需要把关心的几个业务节点森林自由组合在独立 Tab 里对比交叉逻辑，并能从宏观业务关系一路平滑下钻到微观状态机/流程图，同时不丢失与外部邻居模块的上下文连线。

## What Changes

- **多 Tab 非破坏性视图切片**：顶部提供 `[ 默认全景 ]`、`[ 自定义组合 N ]` 与 `[ + ]`，允许人类按关注主题拉入任意业务森林子集形成独立视角；视图配置存在本地 `.llman-sdd/studio/`，增删 Tab 不改动 `llmanspec/specs/`。
- **宏观业务森林星图（Obsidian Graph 风格）**：在宏观全景层使用 `d3-force` 物理力导向布局（基于 `@statelyai/graph` + `@xyflow/react` 混合实现），以权重圆球大小直观反映能力/规则密度，外围小卫星节点展示上下游依赖。
- **上下文边界保留下钻（Boundary Portals）**：双击宏观业务圆球后，在画布内平滑切换为确定性 `elkjs` 排布的状态机/流程图，并在容器外围保留外部邻居气泡与出入连线；点击外部气泡先弹出轻预览卡片，由人类决定“拉入当前 Tab 对比”或“跳转”。配顶部路径面包屑防止多层下钻迷路。
- **跨森林交叉桥高亮（Cross-Forest Bridge）**：当自定义 Tab 同时包含多个业务森林时，提供一键高亮横跨森林的共享状态/事件/规则依赖边并淡化内部无关节点，方便人类快速定位跨业务交叉风险并挂评论。

## Capabilities

- `studio-web`：扩展多 Tab 组合视角、宏观星图布局切换、边界气泡下钻、路径面包屑与交叉桥高亮行为。

## Impact

- 依赖 `add-studio-web-workbench` 先行夯实单状态机画布与 5 态 UI 交互，再在其上叠装空间导航与多 Tab 容器，避免 MVP 首版过重。

## Open Questions

全部核心决策已收敛并写入同目录 [design.md](./design.md)：

- **宏观星图连线来源**：两层叠加——① **自动实线（0 Token）**：从 `llmanspec/specs/` 扫描跨能力 `@req:rXX` 引用、能力名互引及状态机共享状态/事件生成；② **人工参考虚线（仅存本地 `.llman-sdd/studio/`）**：允许人类在自定义 Tab 里拉辅助关联虚线或视觉分组，以实/虚线明确区分规格事实与个人思考，绝不污染 `llmanspec/specs/`。
- **聚焦核心双向映射，暂不做外部格式导出**：本地仅存紧凑的 `.llman-sdd/studio/views.json`，所有节点句柄直接双向映射回 `llmanspec/specs/` 的真实 `capId` / `@req` / `machineKey`，保持对人类与 Agent 最高效一致的表达；Obsidian `.canvas` / Excalidraw 等外部工具导出明确移出 C5 范围，不在早期分散焦点。
