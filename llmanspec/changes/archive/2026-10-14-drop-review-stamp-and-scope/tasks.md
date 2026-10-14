# Tasks

测试 seam(既有,不新造):CLI 子进程 `tests/helpers/spawn.ts` 的 `runCli` / `makeTempRepo`;BDD 步骤 `tests/bdd/steps/*`。验证阶梯按仓库规约 L1→L4,每 task 收尾时全仓 `tsc --noEmit` 与相关单测绿。

- [x] T1 合约先行:绑定分支上改写受影响条款——spec-parsing r8(头契约收缩为 capability+purpose)、validation r12(去 scope 门禁子句)/r47(JSON 载荷口径)/r92(整条删除,纯 scope 机制)/r74(去空 scope 文案子句)、review-freeze r23(信号集收缩与 summary 口径)/r33(过滤口径收缩)、peripheral-commands r22(skeleton 头注释)及相关场景;提交 specs。
- [x] T2 核心退役 `[blocked-by: T1]`:parser/ir 头结构收缩(scope/reviewedThrough 字段删除);删除 `packages/core/src/validation/staleness.ts` 及 validate/review 的消费链(含 validate JSON `staleness` 键、review stale 信号与 summary 口径、`review.ts`/`commands/validate.ts` 传参);删除 `SpecSummary.validScope`;修复全部单测与 bdd。
- [x] T3 模板与 skills `[blocked-by: T2]`:删除 review-stamp unit 与 apply/verify 注入;skeleton 模板去 `# scope:` 行;`init --update` 重渲染并提交 `.agents/skills` 与 tests/golden 基线;`check-skills-template-render` 绿。
- [x] T4 迁移命令 `[blocked-by: T2]`:实现 `spec migrate-scope`(剥除两类头注释行,幂等,`--dry-run`,结尾后续清单);cli.feature/peripheral-commands 补场景;单测 + bdd;自举:对本仓 `llmanspec/specs/**` 执行剥离并提交。
- [x] T5 迁移文档 `[blocked-by: T3, T4]`:`migrations/` 升级说明(三破坏面 + 命令用法);CHANGELOG 条目;scaffold 版本 bump。
- [x] T6 全量门 `[blocked-by: T5]`:`just qa` 全绿;`llman-sdd validate --all --strict` 与 `validate --check` 绿;review/validate 输出人工抽查无 stale 残留。
- [x] T7 迁移中枢收编 `[blocked-by: T6]`:一次性迁移收敛 `project migrate`——`prompt --version-expr` 输出 agent playbook(未知/畸形对报错列已知项)、`strip-legacy-headers` 接替 `spec migrate-scope` 并更名、裸调用总览追加版本对清单;合约 r100 重写+r22 协调、steps/unit 同步、docs(migrations/CHANGELOG/proposal/design)对齐;复跑全量门绿。
