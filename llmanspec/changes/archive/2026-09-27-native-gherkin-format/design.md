# Design: 原生 Gherkin 格式(engine + tool + migration)

## 决策 1:IR 以「规则」为一等公民

`RuleIR { reqId, title, description, scenarios[] }` + 顶层孤儿场景列表。解析映射:
- `规则:` 块的名称与描述 → 规则标题/需求文本;`@req:<id>`(块头标签)→ reqId。
- 嵌套 `场景:` → 该规则的 scenarios(步骤原样;无步骤场景跳过执行)。
- 顶层(不在任何 `规则:` 内)`场景:` → orphan(validate WARNING,原 r65 语义迁移至此)。
- 旧标签(`@human/@rule/@executable/@manual`)在解析层**忽略**(不解释语义);文件迁移须显式运行 `spec migrate-native`——引擎不为旧文件维护长期双轨。

## 决策 2:验证门(结构性、去补丁)

- ERROR:规则缺 `@req`(必带);`@req` 跨 capability 全局重复(注册表,dedupe 与 next-req-id 沿用)。
- WARNING:orphan(顶层)场景(原 r65);规则 `@req` 引用未知?不存在(结构内聚),迁移后无此域。
- 聚合计数(INFO,缺省隐藏,review 信号暴露 + `--include-info` 可见):裸规则 = 无嵌套场景的规则数,按 capability 聚合一条,不逐条爆炸;strict 不升级,避免治理类长期卡门禁。
- 删除:互斥(tag:rule-exec-exclusive/human-exec)、无守护 ERROR、MUST 词检查、悬空链接校验。

## 决策 3:可执行性语义

场景天然可执行(runner 展平全部运行);0 步骤场景跳过;`@skip/@experimental` 保留(标签仍可用于 runner 退出)。`@executable` 不再需要——其历史职能(区分规则/验收)由结构承担。

## 决策 4:迁移工具 `spec migrate-native`

- 输入:feature 路径(可目录/`--all`),`--dry-run` 只输出计划;缺省交互逐文件确认;`--yes` 全量。
- 变换:旧 `@req:<id> @rule` / `@rule @human` / `@human` 规则场景 → `@req:<id>` + `规则:` 块(statement/描述原样带入);带同名 `@req` 的 `@executable` 验收 → 嵌套进该规则;无 `@req` 的 `@executable` → 顶层孤儿场景保留;`@skip/@experimental` 保留;其余标签剥除。
- 校验:迁移后文本用原生 parser 可解析、逐字等价(描述/步骤零改动,仅结构/标签变换)。
- 对外通用:任何 llman-sdd 项目可用它完成新格式切换。

## 决策 5:存量迁移与保底

13 文件由工具产出迁移;单测与逐字校验兜底;迁移后实测**0 裸规则**(全部规则含嵌套场景;旧 r84/r85 本就在标签轨挂了验收),`pending-baseline.json` 以 maxPending=2 保留治理余量,双保险不虚构。

## 决策 6:模板与文档

feature-contract/validation-hints/propose/apply/verify(zh/en)全部改为原生样式教学(示例即 `规则:`+嵌套 `场景:`);`@executable/@human/@rule` 从教学中删除;AGENTS.md 两条过时范围决策(add-req 默认 @human、规则块停用)随之更新;golden 与 `.agents/skills` 重生成。

## Impact 复核

- 删除的引擎代码面:classify/互斥/MUST/guard/悬空链接/onlyTagged 相关;新增:RuleIR、nested runner、migrate-native、聚合计数。
- @req 全机器保留(注册表/next-id/dedupe/resolve-req),仅载体从「场景标签」迁到「规则块头标签」。
- 风险:大重构回归 → 先保引擎原生 fixture(新)再动存量;迁移逐字校验;门禁以真实 harness 证据为准。
