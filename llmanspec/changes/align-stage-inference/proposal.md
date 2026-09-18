---
depends_on: []
---

# stage 推断规则对齐 v1 单调语义

## Why

双二进制对拍实证:同一 change(proposal + tasks.md、无 design.md),v1 `list` 判 `draft`,v2 判 `planned`。v1 规则是单调式(determine_stage:designed 需 design.md;planned 需 design.md+tasks.md 双全;tasks 单独存在不升级),v2 实现成了"有 tasks 即 planned",跳过了 designed 档,导致 stage 值域行为与 v1 不兼容(对齐差距清单-语义分歧)。

## What Changes

- `packages/core/src/report/collect.ts` 的 stage 推断改为单调四档:draft(仅 proposal)→ designed(+design.md)→ planned(design.md+tasks.md 双全)→ full(另有 branch 绑定)。
- stage 保持纯推断量,不写盘(现状与合约一致)。
- 补 stage 判定矩阵单测与 BDD 场景;`list` 人读/JSON、`show` 的 stage 展示随之自动对齐。

## Capabilities

- `change-lifecycle`(stage 单调推断合同,新增 @req:r34 规则)

## Impact

- 仅 core collect 一处判定函数;下游 list/show 无需改动。
- v2 现网"只有 tasks.md"的存量 change 在 list 中 stage 会从 planned 回落为 draft——属对齐预期行为变化,随本 change 在 specs 声明。
