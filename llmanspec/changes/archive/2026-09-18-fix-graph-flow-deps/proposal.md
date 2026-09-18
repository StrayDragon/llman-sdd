---
depends_on: []
branch: sdd/fix-graph-flow-deps
base_branch: main
base_sha: e870b6ee60a92e24ce5a3fdef5d9e278e3aa3d79
---

# 修复 graph 依赖边对流式 depends_on 的解析缺失

## Why

双二进制对拍（v1 Rust 0.0.78 vs v2 0.1.4）实证：对同一 `depends_on: [add-user-login-endpoint]`（流式写法）的 proposal，v1 graph 正确画出 archived 节点与 depends on 边，v2 只画孤立节点——`packages/core/src/report/graph.ts` 的 `parseDeps` 仅支持块式（逐行 `- `）列表。而 `change new` 自产模板就是流式 `depends_on: []`，用户顺势改成 `[x]` 是最自然的编辑路径，图却在静默断边，属于正确性 bug（对齐差距清单 P0-1）。

## What Changes

- `parseDeps` 放宽为同时支持流式（`depends_on: [a, b]`）与块式（`depends_on:` + 逐行 `- x`）两种 YAML 风格，`depends_on: []` 空流式兼容（现状）。
- 两种风格解析结果 MUST 一致；畸形 frontmatter 按无依赖处理，不中断 graph 输出（现状语义保留，纳入合约）。
- 补齐单测矩阵（flow/block/空 flow/畸形）与 `@executable` BDD 场景（先红后绿，TDD）。

## Capabilities

- `peripheral-commands`（graph 依赖边解析合同，新增 @req:r30 规则）

## Impact

- 仅 `packages/core/src/report/graph.ts` 及测试；CLI 面无变化。
- 修复后 `tests/unit/report.test.ts` 既有块式断言不受影响；golden 与 skills 渲染无关。
