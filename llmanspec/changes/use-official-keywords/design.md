# Design

## 官方词表来源与形状

`import { dialects } from '@cucumber/gherkin'`——即官方 gherkin-languages.json,Record<语言码, 方言定义>,每个方言含 `feature/rule/scenario/given/when/then/…` 的**同义关键字数组**(如 zh-CN `rule: ["Rule","规则"]`、`given: ["* ","假如","假设","假定"]`)。解析器 TokenMatcher 接受表内任一同义词,故「使用官方词表」= 发射的关键字必须是对应方言表内成员。

## 选取策略(确定性)

过滤 `* ` 星号步 → trim → 优先首个**本地文字(非 ASCII)**同义词 → 否则取首个。

理由:官方表同义词序不保证本地化词优先——zh-CN `rule` 首位是 "Rule"、`given` 首位是星号步,盲取 [0] 会把 zh-CN 输出漂移成 `Rule:`/`* `;该策略对 en(全 ASCII → Rule/Scenario/Given/When/Then)与 zh-CN(非 ASCII → 规则/场景/假如/当/那么)逐字节复现现行合约关键字,对 fr(de 等)产出官方表内本地词(Règle/Scénario/Soit/Quand/Alors——fr `scenario: ["Exemple","Scénario"]` 中 Exemple 为纯 ASCII 被跳过)。en 步骤关键字表内带尾随空格("Given "),trim 后组装 `${kw} ${text}` 与现行输出一致。

未知/无表语言:`officialKeywords()` 返回 null,调用方**整体回退 en**(头 + 关键字同源,文件可解析)——与现行非 zh locale 行为一致,不为无效 locale 引入新的错误路径。

## 三处发射点收敛

- `migrateNative()`:`kw` 表改由 `officialKeywords(sourceDialect(…))` 选取;en/zh-CN 行为逐字节不变(单测回归锁定),fr 等方言由解析自检兜底。
- `authoring.ts`:方言解析口径 = 目标文件 `# language:` 头 > `功能:` 探测(zh-CN)> en;`keywordsOf` 改走官方词表;`addScenario` 块边界正则 `^  (规则|Rule|场景|Scenario|功能|Feature):` 改为由官方词表动态构建(全部方言的 feature/rule/scenario 关键字转义交替,模块级常量,只匹配 2-space 顶层行,嵌套场景不受影响)。
- `skeletonContent()`:语言 = `localeToGherkinLang(locale)`(修复 r7 透传违背:fr → `# language: fr`),语言在官方词表内才用之否则回退 en;关键字走官方词表(修复 en 骨架中文步骤混合方言 bug);TODO 描述文案属 prose 非词表,维持 zh/en 二元 + en 兜底。

## 不做的事

- 不改 validate/review 的报错与报告文案(英文,与词表无关)。
- 不改 CLI 命令面/旗标/帮助文案(帮助文本中的 `规则:`/`场景:` 是对本仓 zh 原生格式的描述)→ 无需 `init --update`。
- 不给 skeleton 输出加解析自检(头与关键字同源自官方词表,构造即一致;migrate 的自检已由 r88 覆盖)。
- 不扩展解析兜底链(仍 en → zh-CN 两步,r7 合约不变;其他方言依赖显式 `# language:` 头自动切换,官方解析器原生支持)。

## 测试边界

- 单测:tests/unit/keywords.test.ts(新,选取策略跨方言断言);tests/unit/spec.test.ts(fr 迁移 roundtrip、en skeleton 回归无中文步骤、fr skeleton、fr 文件 add-req/add-scenario)。
- BDD:tests/bdd/steps/parse.ts 复用「迁移该 feature 为原生格式」when,新增 fr 迁移 given/then、fr skeleton when/then、en 骨架正文断言 then。
