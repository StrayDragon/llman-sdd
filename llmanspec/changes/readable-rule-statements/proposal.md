---
depends_on: []
---

# 规则 statement 可审查性:多行描述与 `- ` 前缀清理

## Why

规则场景(`@req:<id> @rule` / `@rule @human`)的 statement 全文写在场景描述里,但 13 个 spec 文件的 87 条规则多为 200+ 字符的**单行跑马**,审查方(人)几乎无法阅读;且历史写法在描述行首残留 `- ` 列表前缀——它不是 Gherkin 语法,却会原样进入 statement,污染 `resolve-req` / context 输出。解析器本就按行保留描述(`scenario.description.split('\n')`),多行能力一直在,瓶颈只在撰写引导与存量文本。本 change 落地多行书写并清理前缀,不新增任何行为合约。

## What Changes

- specs 层:13 个 capability 文件共 87 条规则 statement 由单行改写为多行描述(语义逐字保持、MUST/SHALL 语义词不变、不带 `- ` 前缀)。
- 模板层:zh-Hans/en 的 `feature-contract.md` 示例与 `llman-sdd-propose.md` 撰写节补「statement 较长时拆多行、不使用 `- ` 列表前缀」引导;r19/r66 等价门随 golden 基线重生成维持。
- 引擎:零运行时代码改动——解析/渲染(validate/resolve-req/context)随源文本自然多行,不新增转义。
- 明确不做:不新增「超长单行判 WARNING」等机器风格门(纯表述与引导,避免把风格硬编码成合约);不改 `spec add-req` 命令行为(statement 由调用方提供,多行与否归作者)。

## Capabilities

- spec-parsing:statement 提取口径语义不变,仅回归验证。
- init-generators:模板文本变更 + r19 golden 等价门 + `.agents/skills` 刷新。

## Impact

- 代码:`packages/core/templates/**` 文本与 tests/golden/baseline 重生成;packages 运行时代码零改动。
- 不兼容变更:无——resolve-req/context 输出随源文本自然变为多行且无 `- ` 前缀,现有契约断言均按子串/语义匹配(实施期核验)。
- 文档:不新建独立文档;`llmanspec/AGENTS.md` 工程规则不改(撰写引导属于 skill 模板层)。
