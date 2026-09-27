# Design: drop-orphan-concept

## 决策 1:孤儿语义面全部删除,顶层场景回归功能级示例

官方 Gherkin 原生允许功能级 `场景:`(不在任何规则内)。原生模型下这些场景**不构成错误或警告**——它们只是"无规则句柄的功能级示例"。删除:validate WARNING、review `unbound` 信号、r65 整节、migrate 的前置保序。IR 内部 `orphans` 字段保留名(避免无谓扩散),注释明确其"功能级示例、无告警"语义;用户可见面全部改名/移除:
- `list --specs`/`show` morphology `orphanAcceptanceCount` → `featureScenarioCount`;
- `review` 信号 `unbound` 删除(kind/predecessor r5 语义取消)。

## 决策 2:迁移自然排序

`migrate-native` 无归属验收不再前置:直接置于文件末尾作为功能级顶层场景;官方解析会将其并入前一规则(实际的"功能级归属"),无任何特殊信号。旧文件里的"无归验收"经迁移后即正常嵌套,不产生告警面——与"没有不可程序化/不可归属之逻辑"的定案一致。

## 决策 3:统计口径

- 规则统计(rules/enforced/pending)只看 `规则:` 块及嵌套场景;
- 功能级顶层场景计入 `featureScenarioCount`,不计入 acceptance/enforced;
- runner 仍会执行功能级顶层场景(官方 Gherkin 语义,步骤定义需与普通场景一致)。

## Impact 复核

- 本仓 0 顶层场景:迁移、统计、runner 均无实际影响。
- 输出契约微变(0.5.0):morphology 字段更名 + review 去 unbound;对应 r20/r21/r23 与测试同步。
- 无新增标记;唯一规范样式(规则块+嵌套场景)不变。
