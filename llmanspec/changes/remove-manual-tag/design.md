# Design: remove-manual-tag

## 决策：移除 @manual（而非补齐 waiver 语义）

两个候选：

- **A（采纳）移除 @manual**：`@human` 本义即「约束规则、由人判定」，`@manual` 语义重复；
  pending 是 INFO 级台账（不 gate、不进退出码），waiver 只在 pending 有门禁效力时才有价值；
  三处实现（parser 字段 / review 桶 / CLI 文本嗅探）互相矛盾，说明概念从未被真正需要；
  live specs 与消费仓使用量为 0。移除后语义最简：pending = 尚无 `@executable` 验收的规则数，
  台账无法被打标清零，coverage 口径唯一。
- **B（否决）修复 waiver 语义**：validate 加 `&& !sc.manual`、review pending 过滤加 `&& !r.manual`。
  这等于允许「打一个 tag 就把规则从 pending 台账清零」，台账失去审计意义；且需先论证
  为什么台账应该允许被打标清零——当前无此需求场景。三处不一致还要收敛成一套口径，成本更高。

## 迁移信号

残留 `@manual` 在 parser 层报显式 ERROR：`@manual was removed in 0.3.0 — drop the tag
(@human already implies human judgement)`。给消费仓可执行的迁移动作，不静默忽略。
随仓库发布 `migrations/v0.2-v0.3/`（README prompt 说明 + 检查脚本）。

## 口径变化

- review 信号：六种 kind → 五种（删 manual）；warningCount = pending + unbound + stale 总数（口径不变，只是少了恒与 pending 双计的 manual）。
- morphology：删 `ruleManualCount` 字段与 `list --specs` 文本列；enforced/pending 两态。
- validate coverage INFO 文案：`rule rN is pending: no @executable acceptance scenario`（去掉 waiver 从句）。
