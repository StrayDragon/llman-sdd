# 任务清单:readable-rule-statements

> 只列实现与验证任务;收口(`change finalize`)是流水线步骤,不列为任务。

- [x] T1: 存量 specs——13 个 capability 文件的规则 statement 由单行改写为多行描述并去除 `- ` 前缀(语义逐字保持;改动与验证分批:每批改写后 `bun apps/cli/src/main.ts validate --specs --strict` 绿再继续)
- [x] T2: 模板——zh-Hans/en 的 feature-contract.md 示例与 llman-sdd-propose.md 撰写节补多行/去 bullet 引导
- [x] T3: 引用基线重生成与等价门——`bun run generate:skills-template-baseline` 重生成 golden + `bun run check:skills-template-render` 通过
- [x] T4: 狗粮刷新——`bun apps/cli/src/main.ts init --update` 重渲染 `.agents/skills` 并提交
- [x] T5: 全量门禁——`just qa` 全绿 + `validate --specs --strict` + `review` criticalCount=0 + 抽取 statement 逐字等价核验(去缩进/换行后与原文本一致)
