# Design: unify-numeric-id-allocation

## 性能与非持久化约束(2026-10-18 用户补充定案)

两条实现硬约束,apply 阶段验收:

1. **高性能 = 单趟收集 + 常数分配**:`nextNumber(used)` 用单趟循环折叠取
   max(O(n) 时间 O(1) 空间;禁用 `Math.max(...used)` spread——大集合有栈
   溢出与性能风险);dedupe 的 max 从既有 `ruleReqIds(entries)` 内存集合
   派生,MUST NOT 发起第二趟文件系统扫描;重映射序列用运行游标递增
   (首个 `max+1`,后续 `++`),每项分配 O(1)。`collectNumbers`/
   `harvestAcrossWorktrees` 保持既有单趟目录遍历;模板变量与
   `change next-id` 在同一次命令调用内共享一次 harvest 结果。
2. **零持久化原信息 = 重扫描即真相**:分配器不引入任何持久化状态
   (计数器、tombstone、缓存文件、索引条目一律不写),分发值每命令调用
   现算。此约束继承 proposal Non-Goals 与 r35 精神;动机是消除持久化
   副本与真实扫描结果之间的缓存不一致面——唯一事实源始终是
   `llmanspec/` 树本身。

## 红线取代声明

「max+1 vs smallest-free 是有意分叉、不得合并」的旧红线（源自
`align-next-req-id-max-plus-one` 的 design 与 peripheral-commands r60 的
「有意 divergent 于前代 smallest free 语义」文案）由本 change **显式取代**。
取代后的新红线：

> 数字 id 分发必须经单一分配器原语（`nextNumber(used) = max(0, …used) + 1`，
> 空集为 1），不得在调用点重写探号循环；分发与「already in use」检验必须
> 消费同一勘察收集器的结果。

旧红线中**继续有效并继承**的部分：退役号不复用（issue #5）；dedupe 按出现
顺序首现保留的语义。

## 勘察发现：模板变量与 change next-id 收集器不同源

提案中「现状已同源」的说法只对算法、不对收集范围（propose 阶段核实）：

- `change next-id` → `harvestAcrossWorktrees`（全 worktree 并集），
  `packages/core/src/change/nextId.ts`；
- `change_id.template` 的 `llman_sdd_unique_id` → `nextUniqueNumber` →
  `harvestUniqueNumbers`（仅当前树），`apps/cli/src/commands/change.ts:137`。

两者都是 max+1，但多 worktree 场景下收集范围分叉。本 change 将模板变量改用
worktree 并集收集器（CLI 层持有 git 可注入，core 渲染保持纯 io），使
「分发值」真正处处同源。相应地 change-lifecycle r60 的「全树含归档的最小
空闲编号」属前代遗留漂移文案（实现早已 max+1），本次一并修正——该修正与
决策条款同落一处，避免二次改约。

## 唯一可观测行为变化

dedupe 重映射序列：`{r1 冲突×2, r5 已用}` 从 `r2`（smallest-free 线性探号）
改为 `r6, r7`（在已用集合上迭代 max+1）。spec-authoring r43 条款与 BDD
期望值同步更新。

## 风险与兼容

- 单根下除 dedupe 序列外无 CLI 可观测变化：`spec next-req-id` /
  `change next-id` 语义不变，仅实现收敛到原语。
- 模板变量收集范围从单树扩大到 worktree 并集，属行为**修正**而非回归
  （与 `change next-id` 对齐）；无多 worktree 的用户输出不变。
- 唯一性域是否升为「全仓跨根」归 `subproject-namespace-scope` 决策
  （frontmatter 已声明 depends_on 本 change）；本 change 只预留勘察根
  参数化点，不做跨根行为。
