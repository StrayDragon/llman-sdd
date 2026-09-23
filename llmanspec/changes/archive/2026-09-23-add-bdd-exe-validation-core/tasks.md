# Tasks

seam:六条场景全部走 CLI 子进程 + mkdtempSync 临时仓库(domain.ts 既有 makeTempRepo);新 When 步骤合并 stdout/stderr 写入 `fixtures['命令结果']` 以复用 smoke 断言步骤;无新测试框架、无新接缝。

- [x] T1: Specs landing——validation.feature r13 重定为委托语义(不执行 harness,责任在项目测试套件,`--check/--no-check` 为 v1 no-op)并新增 r11/r13/r63/r64/r65 @executable 场景;change-lifecycle.feature 新增 r16 @executable 场景;仅动这两个 spec 文件,绑定分支 commit [blocked-by: 无]
  <!-- 实施 batch:r63 场景观察 seam 校正——单条 human 输出对 valid 条目静默(WARNING 不显示),改走 --json 读 items[].issues -->
- [x] T2: BDD 步骤实现——domain.ts 新增 r11/r13/r63/r64/r65/r16 分节步骤(种子缺陷 fixture、no-op 三跑对比、frontmatter 字段门、孤儿验收 JSON 断言、默认分支布局矩阵),复用 smoke「退出码为/stdout 符合正则」;`bun test tests/bdd` 全绿 [blocked-by: T1]
  <!-- 实施 batch:r65 fixture 的规则 req 用 r91——makeTempRepo 的 sample.feature 占用 r1,撞号误触全局重复 ERROR -->
- [x] T3: r13 委托落地——删 changeCheck.ts expandRunCommand/hasPlaceholders/PlaceholderTarget(删前 grep 确认无其他引用)及 validation.test.ts 唯一引用段;main.ts validate `--no-check`/`--check` help 如实化(no-op、v1 parity、BDD 执行在项目测试套件);模板 8 文件(zh/en × explore/verify/propose/validate)文案改写为委托现实;`init --update` 重渲染狗粮 + `golden:generate` 重建基线 [blocked-by: T1]
  <!-- 实施 batch:死代码另在 packages/core/src/index.ts 的 re-export 面(98-99 行)同步移除,属同一簇;llman-sdd-validate 为 extra_skills 可选技能,本仓未启用故狗粮/golden 无其产物,模板本身已改 -->
- [x] T4: 全门禁——`just qa`、`just golden`、`just pending-gate`(19→13)、`validate add-bdd-exe-validation-core --strict --no-interactive` 退出码 0、`review` 退出码 0 [blocked-by: T2, T3]
  <!-- 偏差记录:`validate --all --strict` 退出码 1——7 个 capability(config-command/config-schema/context-index/init-generators/monorepo-structure/peripheral-commands/review-freeze 等)staleness 判 STALE:其 scope 覆盖 apps/cli/src 或 packages/core/templates,本批 main.ts help 文案 + 模板 8 文件改动必然触发(WARNING 经 strict 升级为 ERROR),不修(不得改其他 capability 的 spec);change 级 `validate <id> --strict` 退出码 0,review 非严格 sweep 退出码 0(stale 为 warning 级)。先例:archive/2026-09-23-add-template-command-parity-gate T3 -->
- [x] T5: 收尾——tasks 全勾、`show --output json` readyToImplement=true 确认、`bun run format:write` 无 diff、工作树干净 [blocked-by: T4]
