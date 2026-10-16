# Tasks — fix-next-id-prunable-worktree-warning

测试 seam（既有 harness）：`tests/unit/lifecycle.test.ts`（harvestAcrossWorktrees 单测）+ `tests/bdd/steps/lifecycle.ts`（r35 场景绑定）。

## T1 core：prunable 解析与静默跳过

`spawnGit.ts` 的 `WorktreeEntry` 增加 `prunable` 并解析 porcelain `prunable` 行 → `nextId.ts` 的 `harvestAcrossWorktrees` 跳过 prunable 条目、对保留条目以 `isDirectory` 探测 `<path>/llmanspec` 缺席即静默跳过（`collectNumbers` 不动）→ 单测覆盖三分支（prunable 跳过无 warning、缺席 llmanspec 跳过无 warning、真实读取错误仍 warning）。

- [x] T1 完成，`bun test tests/unit/lifecycle.test.ts` 全绿

## T2 specs r35 澄清与 BDD 场景

绑定分支上改 `change-lifecycle.feature` r35（扫描范围条款补静默跳过语义）+ 新增场景「prunable worktree 静默跳过」→ `tests/bdd/steps/lifecycle.ts` 绑定（临时仓 + `worktree add` 后删目录 → `next-id --json` warnings 为空且编号统计不变）。

- [x] T2 完成，`bun test tests/bdd` 全绿
