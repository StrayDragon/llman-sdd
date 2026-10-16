# Design — fix-next-id-prunable-worktree-warning

## D1: 修法取材——issue #8 三选项的融合

- 选项 1（porcelain 解析 `prunable` 并跳过）为**主修**：在数据源头排除已失效 worktree，语义最准（条目本身代表不存在的树）。
- 选项 3（缺席探测）为**竞态补强**：`worktree list` 成功与 `listDir` 之间目录仍可能被删（或 worktree 检出自无 `llmanspec/` 的历史提交），故保留条目再经 `NextIdIo.isDirectory(<path>/llmanspec)` 探测，缺席即视为空树静默跳过。
- 选项 2（只对非 ENOENT 记 warning）**不单独采用**：按 errno 字符串分流脆弱；跳过策略使 ENOENT 根本不到达 `collectNumbers`，其余 errno 自然落入既有 warning 路径。

## D2: `collectNumbers` 保持不动

当前树的扫描错误告警（含真错误）语义不变；缺席静默语义只加在 harvest 的 worktree 树过滤层，`harvestUniqueNumbers` 等单树消费方零影响。

## D3: `WorktreeEntry` 向后兼容

新增 `prunable: boolean` 字段（缺省 false）；既有消费方（r69 held-target 探测、r24 main-checkout probe）按字段读取不受影响，无迁移。
