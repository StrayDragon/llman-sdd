---
depends_on: []
title: 嵌套面包屑展示完整多级路径
branch: sdd/align-studio-multilevel-nest-crumb
base_branch: main
base_sha: 8cd8124a65b404d0504eaaa0324e8544c0801520
---

# 嵌套面包屑展示完整多级路径

## Why

贴框「返回上层」目前只带父层名与当前层，三层下钻看不到根机与中间层，也无法点祖先跳回。demo 是「返回上层」+ 根机到当前层的整条路径（当前层高亮并标 L<n>）。

## What Changes

- 贴框面包屑渲染 Tab 根机 + nestStack 每一层；当前层高亮并附 L<n>；祖先可点跳到该层。
- 「返回上层」只表示上一层（不把父层名拼进按钮），并选中宿主。
- 层级标签优先用目标机 `ruleTitle`，流程图加「(子流程)」。

## Capabilities

- `studio-web`：嵌套贴框多级面包屑。

## Impact

- 前端：`apps/studio` 边界框 chrome。不改抽取、CLI、深链语法。
