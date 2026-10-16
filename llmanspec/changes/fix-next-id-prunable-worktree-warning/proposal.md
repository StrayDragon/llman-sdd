---
depends_on: []
title: next-id 静默跳过已失效 worktree,消除 ENOENT 噪音告警
---

## Why

GitHub issue #8（bug 标签）：`change next-id` 在存在**已删除目录的 linked worktree**（`git worktree list --porcelain` 标注 `prunable`）时，人读输出与 `--json.warnings` 都会混入 `cannot list <worktree>/llmanspec: ENOENT` 噪音。`next-id` 是只读预览命令，残留 worktree 属常见状态（临时 worktree `rm -rf` 后即 prunable），不该产生告警。本仓沙箱已复现，`git worktree prune` 后消失，佐证根因。

根因（探索期已核实）：

- `worktreeList`（`spawnGit.ts`）已消费 `--porcelain` 但只解析 `worktree/HEAD/branch` 三类行，`prunable` 属性被丢弃；
- `harvestAcrossWorktrees`（`nextId.ts`）对每个条目无差别拼 `<path>/llmanspec` 交给 `collectNumbers`；
- `collectNumbers` 对 `listDir` 的**任意**异常一律记 warning，不区分 ENOENT（树缺席）与真错误（如 EACCES）。

specs r35 只钉两种 warning（worktree list 失败退化、同编号跨 worktree 提示），ENOENT 噪音是实现伪影而非合约要求——移除不违约，但需把新行为显式钉入 r35 防回归。

## What Changes

- **`worktreeList` 解析补全**：`WorktreeEntry` 增加 `prunable: boolean`，porcelain 的 `prunable [reason]` 行置真。
- **harvest 静默跳过**：`harvestAcrossWorktrees` 跳过 prunable 条目；对保留条目先以 `NextIdIo.isDirectory` 探测 `<path>/llmanspec`，缺席视为空树静默跳过（顺带覆盖「扫描中途目录被删」竞态）；其余 listDir 失败仍记 warning。
- **`collectNumbers` 语义不动**：当前树的真实读取错误告警保留。
- **r35 合约澄清**：扫描范围条款补「prunable 条目静默跳过、worktree 的 `llmanspec/` 缺席视为空树静默跳过」+ 新增可执行场景。

## Capabilities

- `specs/change-lifecycle`（r35 条款澄清 + 1 个新场景）

## Impact

- 代码：`packages/core/src/git/spawnGit.ts`（解析一行）、`packages/core/src/change/nextId.ts`（跳过逻辑）。
- 测试 seam 均为既有：`tests/unit/lifecycle.test.ts`（harvest 单测）+ `tests/bdd/steps/lifecycle.ts`（r35 场景绑定）。
- 修法为 issue 三选项的融合（解析层跳过 prunable = 选项 1；缺席探测 = 选项 3；保留真错误告警 = 选项 2 的边界），无迁移、无破坏性变更；`worktreeList` 的既有消费方（r69 held-target 探测、r24 main-checkout probe）对新增字段向后兼容。

## Open Questions

（issue 建议即用户确认的修法，2026-10-16；无未决项）
