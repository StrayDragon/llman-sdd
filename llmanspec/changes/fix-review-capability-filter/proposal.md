---
depends_on: []
---

# review --capability 参数接线(落实现有合约 r23)

## Why

合约 r23(`review-freeze.feature`)已明确规定 `--capability` MUST 限定单一 capability,但 v2 CLI 只注册了该选项而 action 从未消费(`apps/cli/src/main.ts` 注册与 action 脱节),core `buildReview` 也没有过滤入参——对拍中 `review --capability auth` 与无参输出完全相同。这是自家合约的实现缺口(对齐差距清单 P0-3)。

## What Changes

- core `buildReview` 增加 capability 过滤入参:pending/manual/unbound/stale 四类信号 MUST 限定为该 capability;locked 与 validate 汇总保持全局口径(退出码语义不变)。
- CLI `review` action 将 `--capability` 传入 core;`--json` 输出同样过滤。
- 未提供 `--capability` 时保持全量信号(现状)。
- 新增 @req:r33 规则固化过滤语义(与 r23 互补:r23 定"必须支持",r33 定"过滤口径"),补单测与 BDD 场景。

## Capabilities

- `review-freeze`(过滤语义,新增 @req:r33 规则)

## Impact

- `packages/core/src/review/review.ts` + `apps/cli/src/main.ts`;其余信号实现不动。
- 既有 review-freeze r23 的 @executable 场景(全量口径)不受影响。
