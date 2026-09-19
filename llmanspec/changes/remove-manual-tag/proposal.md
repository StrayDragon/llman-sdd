---
depends_on: []
---

## Why

`@manual` 的文案承诺它是 waiver，但实现中从无豁免效力，且「manual」存在三处互相矛盾的实现：

1. validate 不读 manual：coverage 循环只检查规则是否被 `@executable` 验收覆盖，
   发出的 INFO 文案却声称 "no @executable acceptance scenario and no @manual waiver"（复现脚本 MVP-1）。
2. review 双计：pending 与 manual 是两个独立过滤器，`@manual` 规则同时落在两个桶且永不退出 pending（复现脚本 MVP-2）。
3. CLI `show --json` 的 `ruleManualCount` 用 `reqIds.includes('manual') || statement.includes('@manual')`
   文本嗅探，与 parser 的 `manual` 字段不是同一套逻辑。

`@human` 本义即「约束规则、由人判定」，`@manual` 与之语义重复；pending 只是 INFO 级台账
（不 gate），waiver 仅在 pending 具备门禁效力时才有价值。消费仓 live specs 中 `@manual`
tag 实际使用量为 0（grep 验证）。移除后语义最简：pending = 尚无 `@executable` 验收的规则数，
台账无法被打标清零。

## What Changes

- parser：移除 `manual` 字段与 `tag:manual-orphan` 检查；对残留 `@manual` tag 报显式 ERROR
  （含迁移指引），不静默忽略。
- validate：coverage INFO 文案去掉 "and no @manual waiver"。
- review：`ReviewKind` 删除 `'manual'`，信号与输出迭代同步删除（pending/manual 不再双计）。
- report（`list --specs`）与 CLI `show --json`：删除 `ruleManualCount`（morphology 回到
  enforced/pending 两态；CLI 内联文本嗅探副本一并删除）。
- 行为合约（Specs landing，绑定分支上）：spec-parsing r9、validation r12、review-freeze r23/r33
  中 `@manual` / manual 桶语义移除。
- skills 模板源（en/zh-Hans validation-hints、feature-contract 单元）+ golden 基线重渲染。
- 破坏性合约变更（移除 tag 值域）→ 升级路径 `migrations/v0.2-v0.3/`（README prompt）；
  版本升 0.3.0，新建 CHANGELOG 注明迁移说明。

## Capabilities

- spec-parsing（r9 标签分层语义）
- validation（r12 规则域）
- review-freeze（r23 五信号合同、r33 capability 过滤口径）

## Impact

- breaking：消费仓 spec 含 `@manual` 时 validate 报 ERROR，需删除该 tag（`@human` 已覆盖其语义）；
  依赖 review manual 桶或 `ruleManualCount` 字段的下游脚本需改用 pending 口径。
- 有 MVP-1/MVP-2 复现脚本（/tmp/llman-sdd-repros/），修复后改断言新行为并跑绿。
