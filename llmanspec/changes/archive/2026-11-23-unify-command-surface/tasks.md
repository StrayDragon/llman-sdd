# 任务：统一命令面

测试边界（seam）：复用 `tests/bdd/` 里 change、spec、project、freeze 的 CLI 子进程步骤，以及 `tests/unit/` 里直接导入的 lifecycle 函数。规格改动只在绑定分支上提交。

- [x] T1: 在绑定分支改 `change-lifecycle`、`review-freeze`、`cli`、`completion`、`peripheral-commands`、`spec-authoring`、`spec-parsing`、`validation`、`scope-boundaries`、`monorepo-structure`，写成提案里的命令面
- [x] T2: `change archive` 吸收合并前校验、`--no-check`、`--no-commit` 与 worktree 内执行；保留干净工作区拒绝和 `--dry-run`；删除 `--force` 与 `change finalize` [blocked-by: T1]
- [x] T3: 删除 `archive` 父命令；`freeze` 与 `thaw` 升为顶层，旗标不变 [blocked-by: T1]
- [x] T4: `change start` 吸收 attach 的绑定与 `--force` 重绑；删除 `change attach` [blocked-by: T1]
- [x] T5: `spec skeleton` 改名为 `spec new`；删除 `spec migrate-native`、`strip-legacy-headers`、`--kind`、`--version-expr` [blocked-by: T1]
- [x] T6: 技能正文、完成脚本、`llmanspec/AGENTS.md` 的命令名改为新表面。`llman-sdd-archive` 这个目录名保持不变 [blocked-by: T2, T3, T4, T5]
- [x] T7: 补 BDD 与单测，使 T1 的场景可执行 [blocked-by: T2, T3, T4, T5, T6]
- [x] T8: `migrations/v0.10-v0.11/README.md` 追加旧命令到新命令的替换表，声明没有别名 [blocked-by: T7]
