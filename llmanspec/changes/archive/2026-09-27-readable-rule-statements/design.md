# Design: 规则 statement 可读性(多行 + 去 bullet)

## 决策 1:纯表述与引导,不新增行为合约

多行描述解析器本就支持(`scenario.description.split('\n')` + 逐行 trim),MUST/SHALL 词检查作用于整段 statement(多行同样命中),故本 change **不改任何引擎行为合约**:不新增「超长单行判 WARNING」等机器风格门,不改 `spec add-req` 命令行为。价值全部来自存量文本与撰写引导,风险最小。

## 决策 2:存量重排方法(reflow 约束)

对 13 个 spec 的 87 条规则 statement(`@rule`/`@rule @human`,即全部 `    - ` 行)执行语义等价的机械重排:

- **反引号代码段原子性**:断行不得落在 `` `...` `` 内部(逐字保持是硬约束,命令语法/路径不可被换行劈开)。
- **无断点即溢出**:长 ASCII token 串(如 `llman-sdd-wayfinder/...`)无安全断点时允许该行超出目标宽度,禁止 mid-token 硬切断(曾损坏 `llman-sdd-research` → `ll man-sdd`).
- **步骤关键字护栏**:描述行(含每个 bullet 转换出的首行)不得以 `当/假如/那么/而且`(en `Given/When/Then/And/But`)开头——会被 Gherkin 解析为步骤且后续行全部失效。故:
  - r81「收口合并前执行验收命令」statement 首词 `当`→`在`(同义条件句)是**唯一内容改动**,已在变更说明中显式声明。
  - 重排断点用前瞻护栏拒绝落在关键字前,并在验证中逐行复核。
- **验证方法论**:HEAD vs 分支用「空白全部删除」等价(换行→无,不算差异)+ 反引号段逐字比对 + 规则场景无关键字行;杜绝「按空白折叠」比较的误报。结果:0 prose diff、0 code-span diff、0 关键字行(除声明过的 r81)。

## 决策 3:多 bullet 规则保留行结构

现有 5 处规则场景带多条 bullet(每条是一个独立 MUST 条款),去 `- ` 前缀后各自成为独立描述行,保留其条款边界(不合并成一段),视觉可读且语义零改动。

## Impact 复核

- 引擎:零运行时代码改动。
- validate/review/BDD:规格语义不变;`just qa`(442 tests,含 specs 驱动 BDD 全量)、`validate --specs --strict`、`review criticalCount=0` 全绿。
- 变化面:specs 文本(换行/去 bullet)、模板引导(zh/en 的 feature-contract 与 propose)、golden 基线与 `.agents/skills`(随模板重生成)。
