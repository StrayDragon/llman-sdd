# Tasks

测试接缝(seam):复用 tests/bdd/steps/lifecycle.ts 与 archive.ts 既有 TempRepo/CLI 子进程步骤;双 worktree fixture 经 `git worktree add` 构造;不发明新 seam。

- [x] T1: Specs landing——change-lifecycle.feature r35 扩展(跨 worktree 扫描口径/退化/同编号 warnings)与 review-freeze.feature r24 扩展(非主检出 WARNING 合同),各配 @executable 场景;绑定分支 commit [blocked-by: 无]
- [x] T2: 核心实现——nextId.ts harvestAcrossWorktrees(路径去重/list 失败退化/同编号 warnings)+ spawnGit.ts probeMainCheckout/nonMainCheckoutWarning + CLI 接线(change.ts next-id、archive.ts freeze/thaw 警告,不改退出码与产物) [blocked-by: T1]
- [x] T3: BDD 场景步骤——r35 双 worktree fixture 与断言(lifecycle.ts)、r24 次级 worktree freeze 场景(archive.ts);经典 r35/r24 既有场景原样通过 [blocked-by: T2]
- [x] T5: 全门禁——just qa / just golden / just pending-gate(0)、validate add-worktree-hardening --strict --no-interactive 退出 0、review 退出 0;validate --all --strict 他 spec STALE 按先例记偏差 [blocked-by: T3]
- [x] T6: 收口——finalize(协调者执行) <!-- finalize 由协调者执行 -->

<!-- 偏差记录(2026-09-23,按先例不修):`validate --all --strict` 对 config-command/context-index/init-generators/monorepo-structure/peripheral-commands/spec-authoring/validation 共 7 个 capability 报 STALE——其 scope 覆盖 apps/cli/src/、packages/、tests/ 等共享目录,本批 core/CLI/BDD 步骤改动必然触发;不得改他人 spec。门禁口径:change 级 `validate add-worktree-hardening --strict` 退出 0 + `review` 退出 0(stale 为 warning 级);本 change 落地的 change-lifecycle 与 review-freeze 两 spec 均 valid(specUpdated=true)。先例:archive/2026-09-23-add-worktree-aware-lifecycle、archive/2026-09-23-add-bdd-exe-validation-core、archive/2026-09-23-add-template-command-parity-gate -->
