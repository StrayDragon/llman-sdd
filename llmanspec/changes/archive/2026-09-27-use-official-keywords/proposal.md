---
depends_on: []
branch: sdd/use-official-keywords
base_branch: main
base_sha: 6ecba2eaf9dc7550a45887926e6a09dd4279667d
---

# 关键字词表收敛至官方 gherkin 方言表

## Why

方言感知的关键字发射目前分散在三处手写 en/zh 二元常量,无官方来源背书,且带两个实锤缺陷:

1. `skeletonContent()`(report/specHelpers.ts)en 分支的**步骤关键字硬编码中文**(假如/当/那么)——en locale 的 skeleton 产出 `# language: en` 头 + 中文步骤的混合方言文件(靠解析兜底链侥幸可解析);
2. skeleton 对非 zh/en locale 的 `# language:` 头恒写 en,违背 r7「其余 locale 透传」;
3. `migrateNative()`(上一 change 引入)与 `authoring.ts keywordsOf()`(add-req/add-scenario)各维护一份 zh/en 词表,对其他官方方言无能为力,且 `addScenario` 的块边界扫描硬编码四方言交替正则。

官方 gherkin 词表(`@cucumber/gherkin` 导出的 `dialects`,即 gherkin-languages.json,80 方言)才是关键字词表的唯一权威。

## What Changes

- 新增 `packages/core/src/spec/keywords.ts` 公共助手:`officialKeywords(language)` 从官方词表选取 feature/rule/scenario/given/when/then 关键字。确定性选取策略:en/zh-CN 合约关键字逐字锁定(运行时校验其必须为官方表成员,失配回退表内选取,单测钉住字节);其余方言过滤 `* ` 星号步、trim 后取首个同义词。官方表同义词序不保证本地化优先且无统一位置规律(en `scenario: ["Example","Scenario"]`、zh-CN `rule: ["Rule","规则"]`),启发式不可行——该策略保证 en/zh-CN 输出与现行合约逐字节一致,其余方言产出官方表内关键字(如 fr → Règle/Exemple/Soit/Quand/Alors)。
- 三处发射点收敛到该助手:
  - `migrateNative()`:方言渲染关键字改由官方词表选取(行为对 en/zh-CN 逐字节不变);
  - `authoring.ts`:方言解析口径改为目标文件 `# language:` 头优先、`功能:` 探测(zh-CN)兜底;块边界扫描正则改为由官方词表动态构建(覆盖全部方言);
  - `skeletonContent()`:语言 = `localeToGherkinLang(locale)` 且须在官方词表内(未知 locale 整体回退 en,保持可解析),修复 en 步骤混合方言 bug,fr 等官方 locale 骨架获得正确方言头与关键字。
- 自动嵌套验收场景标题(验收示例 / Acceptance example)是合成名称而非关键字,官方词表无此来源——维持本地化映射 + en 兜底。
- specs 措辞同步:r88 关键字来源泛化为官方词表;r41/r42 追加块的关键字口径泛化;r7 的 en skeleton 场景补正文关键字断言并新增 fr skeleton 分支。

## Capabilities

- `specs/spec-parsing`:r7 场景扩充(en 正文断言 + fr skeleton)、r88 措辞泛化。
- `specs/spec-authoring`:r41/r42 措辞泛化(关键字取自目标 spec 方言的官方词表)。

## Impact

- `packages/core/src/spec/keywords.ts`(新增)+ `index.ts` 导出;`migrateNative.ts`、`authoring.ts`、`report/specHelpers.ts`。
- `llmanspec/specs/spec-parsing.feature`、`llmanspec/specs/spec-authoring.feature`(措辞泛化,报告制 WARNING 范围)。
- `tests/unit/keywords.test.ts`(新增)、`tests/unit/spec.test.ts`、`tests/bdd/steps/parse.ts`。
- 对 en/zh-CN 的全部现行输出逐字节不变;fr 等其他官方方言的迁移/骨架/追加从「失败或混合方言」变为「官方词表正确产出」。
