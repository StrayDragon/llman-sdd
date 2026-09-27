# 任务清单：dedup-human-executable-rules

> 只列实现与验证任务；收口（`change finalize`）是流水线步骤，不列为任务。
> 本 change 属大范围改造，按「先加后删 + 分步保绿」排序：引擎扩展（向后兼容）→ specs 标签转换 → 缺口/覆盖补足 → 模板同步 → 门禁全绿。

- [x] T1: 引擎——parser/IR 支持 `@rule` tag 与 `rule` 标志（`@human` 隐式规则；`@rule` 须且仅须带 `@human`/`@executable` 之一）
  - [blocked-by: 无]
- [x] T2: 引擎——validate 规则集扩展（至少 1 条规则、悬空 `@req` 可挂 `@rule`、`@rule` 可自动化规则 0 步骤且 0 链接验收判 ERROR）
- [x] T3: 引擎——review pending/unbound 迁移新规则集；`list --specs` morphology ruleCount 口径（规则数语义）
- [x] T4: 引擎——`@rule` 与 `@executable` 互斥（规则不携带 @executable,runner onlyTagged 天然排除规则,无需锚点跳过逻辑）
- [x] T5: 引擎单测——新增 `@rule` 语义 fixtures（parser/validate/review 三面），既有 fixtures 保持绿
- [x] T6: specs 转换——change-lifecycle（17 条规则标签转换 + r35 语义修订）
- [x] T7: specs 转换——validation / init-generators / monorepo-structure / spec-parsing / cli / config-command / config-schema / spec-authoring（9+9+6+4+3+2+3+3 条规则标签转换）
- [x] T8: specs 转换——peripheral-commands / context-index / review-freeze / eval-playbook（11+6+5+5；其中 eval r84/r85 转 `@rule @human`）
- [x] T9: G1 修复——`NextIdIo.isDirectory` 构造点不跟随符号链接（change.ts/io.ts）+ 单测 + BDD 验收
- [x] T10: 补验收——change-lifecycle r14/r44/r68/r69（场景 + 锚定步骤 + `bun test tests/bdd` 该子集绿）
- [x] T11: 补验收——peripheral r30/r61 + context-index r26/r27/r57（场景 + 锚定步骤）
- [x] T12: 补验收——review-freeze r23/r24/r25（场景 + 锚定步骤）
- [x] T13: 补验收——eval-playbook r82/r83/r86（验收虚挂重构：逐条判别断言）
- [x] T14: 模板——zh/en 双语 propose/apply/verify/validation-hints/feature-contract 按 `@rule` 模型修订 + 两 parity 单测同步
- [x] T15: `init --update` 刷新 `.agents/skills` + `generate:skills-template-baseline` 重生成 golden + 提交刷新结果
- [x] T16: 全量门禁——`just qa` 全绿 + `validate --specs --strict` + `validate <id> --strict` + `review` criticalCount=0
