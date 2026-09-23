# Tasks

测试接缝(seam):复用 tests/bdd/steps/lifecycle.ts 既有 TempRepo/CLI 子进程步骤;双 worktree fixture 经 `git worktree add` 构造;不发明新 seam。

- [x] T1: Specs landing——change-lifecycle.feature 新增 r68(start 分叉保真与 worktree 模式)与 r69(finalize/archive 持有目标执行),各含 @executable 场景;绑定分支 commit [blocked-by: 无]
- [x] T2: 核心实现——startChange(--base/--worktree,config worktree_root/worktree_naming 消费)+ finalizeChange/mergeRenameCommit(持有检测与目标执行)+ git 层 worktree list 解析;main.ts change.ts 模块旗标接线 [blocked-by: T1]
- [x] T3: BDD 场景步骤——r68/r69 的双 worktree fixture 与断言(经典路径回归场景保持逐字节) [blocked-by: T2]
- [x] T4: 模板引导——git-native-flow(-brief) 决策表、archive.md 降级句对齐实现、propose.md start 指引同步(zh+en);init --update 狗粮 + golden:generate + 对账门 [blocked-by: T2]
- [x] T5: 全门禁——just qa/golden/pending-gate、validate <id> --strict、review;tasks 全勾、readyToImplement=true [blocked-by: T3,T4]
- [x] T6: 收口——finalize(协调者执行) <!-- finalize 由协调者执行 -->

<!-- 偏差记录(2026-09-23,按先例不修):`validate --all --strict` 对 config-command/context-index/init-generators/monorepo-structure/peripheral-commands/review-freeze/spec-authoring/validation 共 8 个 capability 报 STALE——其 scope 覆盖 packages/core/templates 与 tests/,本批模板 8 文件 + BDD 步骤改动必然触发;不得改他人 spec。门禁口径:change 级 `validate add-worktree-aware-lifecycle --strict` 退出 0 + `review` 退出 0(stale 为 warning 级)。先例:archive/2026-09-23-add-bdd-exe-validation-core、archive/2026-09-23-add-template-command-parity-gate -->
