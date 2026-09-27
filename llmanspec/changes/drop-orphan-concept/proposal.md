---
depends_on: []
---

# 废除孤儿场景概念:一切以 Gherkin 原生语义为主

## Why

原生 Gherkin 分层落地后,「孤儿验收/孤儿场景」是从旧 `@req` 标签时代搬运的概念(当年用于标记"未挂接规则的验收"),在原生模型下已无实际作用:官方解析器会把首个 `规则:` 之后的场景全部并入该规则,真正"顶层场景"只能在首个规则之前或全文无规则时表达;校验器为此维护一个几乎不可触发的 WARNING + review `unbound` 信号 + r65 整节。经用户定案(2026-09-27):**没有不可程序化为 BDD 流程的逻辑,一切以 Gherkin 原生语义为主**——彻底废除孤儿概念,顶层 `场景:`(Gherkin 本就允许)回归"功能级示例"身份,不告警、不参与规则统计、无特殊信号。

## What Changes

- 引擎:`validate` 删除孤儿 WARNING;`review` 删除 `unbound` 信号(kind 枚举/代码/HTML);`morphology` 字段 `orphanAcceptanceCount` 更名 `featureScenarioCount`(顶层功能级示例计数);IR 内部 `orphans` 字段保留名(注释注明为无告警的功能级示例,降低扩散面)。
- `spec migrate-native`:无归属验收不再前置保序(孤儿身份不再存在),按自然顺序置于最后作为功能级顶层场景;官方解析下被并入前一规则即为其"功能级归属",不再有特殊处置。
- specs 合约:validation r12 改写(删除孤儿 WARNING,顶层场景=功能级示例说明);r65 整节删除并入 r12/r9;review-freeze r23 删除 `unbound`;peripheral r20/r21 字段更名。
- 模板/文档:feature-contract/validation-hints/propose 等移除"孤儿"表述;AGENTS.md 范围决策行、migrations v0.4-v0.5 README 同步;golden 重生成。

## Capabilities

- validation、review-freeze、peripheral-commands、spec-parsing、init-generators。

## Impact

- 输出契约微变(0.5.0):`list --specs`/`show` 的 `orphanAcceptanceCount` → `featureScenarioCount`;`review` 不再输出 `unbound` 信号。issue path `<cap>/acceptance/<名>` 仅剩 r65 删除后的... (该 path 随之消失)。
- 当前仓库 0 顶层场景,迁移与统计零实际影响;纯语义清理。
- 明确不做:不新增其它标记;规则块与嵌套场景保持唯一规范样式。
