---
depends_on: []
---

## Why

`graph` 的深度控制存在语义缺口：**种子模式**（`graph <seed>`）受 `--depth <N>` 约束
（缺省 1，BFS 单层，真实生效）；但**无种子全图模式**（`--scope active|archived|all`）完全
忽略 `--depth`——无论传 `--depth 0/1/5` 都输出相同的全量节点集。

实测影响（当前仓库，50 张冻结卡）：
- `--scope archived`：52 节点 / 26 边，其中 2 个是**被引用但不在 archive 内的依赖**，被
  `buildDefaultNodes` 拉入 scope。
- `--scope all`：53 节点（含活跃 change）。
- 传入 `--depth` 参数被静默忽略（不报错、不生效），属语义漏洞。

用户决策：全图模式也受 `--depth` 约束——**默认 1 层**（scope 内节点 + 每个节点的直接依赖
target，不递归展开），`--depth 0` = 仅 scope 内节点本身（不含依赖 target），`--depth 2+`
递归展开依赖链。种子模式语义保持不变（缺省 1）。这样对 archive 大图默认只呈现一层关系，
避免依赖链无限铺开；需要深挖时显式 `--depth N` 递增。

## What Changes

- **graph 全图模式深度控制（r54 修订）**：`--depth <N>` 对无种子模式同样生效——
  - `--depth 0`：仅输出 scope 内节点（不含任何依赖 target）
  - `--depth 1`（缺省）：scope 内节点 + 每个节点的直接依赖 target（不递归）
  - `--depth N (≥2)`：以 scope 内节点为根递归展开 N 层依赖链
  - 种子模式 `--depth` 语义不变（缺省 1）
- **实现**：`packages/core/src/report/graph/analysis.ts` 的 `buildDefaultNodes` 接收 `depth`，
  按上述规则裁剪节点集；`graphData` / `graphMermaid` 透传 `opts.depth`；CLI `--depth` 在
  无种子时不再被忽略。
- **scope 边界**：`--depth 0` 不拉入 scope 外依赖；≥1 时拉入的依赖 target 若不在 scope
  内，作为节点保留（现状行为），供依赖边展示。
- **BDD/单元测试**：新增全图 depth 场景（default/0/2+ 的节点集断言）+ 防止 `--depth`
  静默忽略的回归断言。

## Impact

- 合约：peripheral-commands r54 修订（graph 范围与深度——全图模式 depth 语义）。
- 影响范围：
  - `packages/core/src/report/graph/analysis.ts`（buildDefaultNodes depth 参数）
  - `packages/core/src/report/graph/graphData.ts` / `render.ts`（depth 透传）
  - `apps/cli/src/commands/graph.ts`（无种子 depth 解析确认或报错修正）
  - spec：`llmanspec/specs/peripheral-commands.feature`
  - 测试：`tests/unit/report.test.ts`、`tests/bdd/steps/peripheral.ts`
- 破坏性：缺省行为变化——无种子全图从「全量节点」变为「scope 节点 + 直接依赖」（默认
  depth=1）。对 `--scope all` 是收缩（不再全量铺开），符合用户意图；`--depth` 缺省需
  在 help/模板中更新描述。
- 风险：低。现有 `--scope archived`/`all` 带显式 `--depth N` 的调用（N≥2）行为不变；
  `--scope active` 缺省显示全图 active（通常少）——按设计 depth=1 也只显示 active +
  直接依赖，若用户需要全 active 用 `--depth 0`。需在 proposal 与 spec 明确 `--depth 0`
  的用途，避免误读「0 = 无限制」。

## Open Questions

- 无（用户已确认：默认 1 层、depth 0 = 仅 scope 节点、2+ 递归；种子模式不变）。
