---
depends_on: []
title: 嵌套下钻保留父层上下文并兼容 DAG 深链
---

# 嵌套下钻保留父层上下文并兼容 DAG 深链

## Why

Studio Web 已有 nestStack 下钻、盒中盒边界与面包屑，但返回上层不选中宿主、嵌套时门户仍只投影跨规格 macroEdges、复合节点不能就地预览子图、Prompt 不含子层净改动、深链不能携带 nest 路径与 macro-edge/state/edge 选中。数据是 DAG（同一子机可被多宿主引用），父层必须由 nestStack 路径决定。目标是把 demo 中这些行为接到 P1 之后的真实抽取数据上，不再依赖 `--demo` 夹具。

## What Changes

- `jumpNestLevel` 增加可选 `focusStateUid`：返回上层时选中并居中宿主状态；点父层邻居门户时选中该邻居。
- 嵌套模式下门户改为当前 nestStack 路径上父机的入/出邻居（事件[守卫] 标签）；非嵌套保持跨规格门户。同一视觉语言，不叠加。
- 边界框标题嵌套时显示「展开内部:<宿主状态名>」并带 L<n>。
- 复合节点就地预览开关（默认关）；子树任一层脏则显示脏标。
- store selector：子树机器集合（visited 防环）、是否脏、子树语义 Diff；Prompt 工作台含全部子层并分层标注。
- 深链向后兼容增加 `nest` 与 `focus`；服务端 markdown/json 带 nest 路径与聚焦摘要；浏览器按路径还原下钻并选中。分享链接带 nest 路径。

## Capabilities

- `studio-web`：嵌套下钻上下文、子树聚合、深链 nest/focus。
- 契约：`packages/core/src/studio/contracts.ts` 的 `studioFocusContextSchema` 向后兼容扩展（不改 P1 嵌套抽取语义）。

## Impact

- 前端：`apps/studio` store / 画布 / App 深链还原 / Prompt 工作台。
- Hub 内容协商：`apps/cli/src/studio-server` 的 markdown/json（不改 CLI 命令与旗标）。
- 不改 core 抽取/写回/N1–N5；不加「设为子机」编辑；不做规则→源码就地下钻；不碰 CLI 命令面。
