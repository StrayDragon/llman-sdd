---
depends_on:
  - fix-graph-flow-deps
---

# graph 范围/深度与 spec 助手兼容 flag

## Why

对拍差距清单:v1 `graph --scope active|archived|all(含逗号组合) --depth <N> [change 种子]`、`spec skeleton --force`、`spec next-req-id --json` 在 v2 缺失(报 unknown option)。graph 现有实现固定 active+被引用 archived,无法只看归档子图或从种子 change 展开依赖;next-req-id 无 --json,脚本无法稳定消费。

## What Changes

- `graph --scope active|archived|all`(逗号组合,缺省 active)、`--depth <N>`(种子 BFS 依赖展开层级,缺省 1)、位置参数 `[change]`(种子);archived 节点仅在 scope 含 archived 且被引用/种子可达时出现;`--format` 非 mermaid 报错(现状)。
- `spec skeleton --force`(覆盖已存在 .feature)。
- `spec next-req-id --json`({reqId})。
- 新规则 r54/r55;单测 + BDD 场景。

## Capabilities

- `peripheral-commands`(@req:r54、@req:r55)

## Impact

- `packages/core/src/report/graph.ts`(scope/depth 过滤,依赖 fix-graph-flow-deps 的双风格解析)+ specHelpers;CLI flag 注册。
