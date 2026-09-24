# Tasks

测试接缝(seam):r2 以 `tests/bdd/assert/quality-gates.ts` 断言脚本承载(既有「执行命令 … 退出码为 0」步骤);r19 以 `tests/bdd/steps/init.ts` 既有 init 渲染夹具承载。不发明新 seam。`CLI` = `bun apps/cli/src/main.ts`。

- [x] T0: Specs landing——monorepo-structure.feature(r2/r3 改写、purpose/scope)、init-generators.feature(r19 改写 + en 验收);绑定分支 commit [blocked-by: 无]
  - 完成判据:两份 spec `CLI validate <cap> --type spec --strict` 退出 0;新 en 场景以 `No step definition` 失败(红灯即预期)

- [x] T1: 门禁集合统一(design D1)[blocked-by: T0]
  - 范围:`package.json` scripts(`pending-gate`、`qa`);`justfile` `qa` / `pending-gate` recipe;`.github/workflows/ci.yml` test job;`tests/bdd/assert/quality-gates.ts` 三处一致性断言
  - 自证(2026-09-24 实测):临时清空 ci.yml `bun run check:schema` 步 → `bun tests/bdd/assert/quality-gates.ts` 退出 1 且输出 `quality-gates: ci.yml 缺 run 步 bun run check:schema`;恢复接线后退出 0(`quality-gates: r2 contract ok`)。临时改动未提交
  - 实测 L0:`just qa` 退出 0,恰含 7 行 `[check]`/`[pass]`(typecheck/lint/format/test/golden:check/pending-gate/check:schema),加三个脚本门各自一行成功摘要(`golden check passed: …skills: 10 files, skills-en: 10 files…`、`pending-gate: 0 pending rule(s), baseline max 0`、`schema artifact up to date`);oxlint/oxfmt/bun test 的工具原生摘要行为与 main 逐字相同(check/test 步未改),无新增输出
  - `just QA_VERBOSE=2 qa` 退出 0;`bun run qa` 退出 0;monorepo-structure r2 场景(质量门禁合约对账通过)绿

- [x] T2: golden 双 locale BDD(design D2)[blocked-by: T0]
  - 范围:`tests/bdd/steps/init.ts` 新 en Given/Then;三类差异报错
  - 自证(2026-09-24 实测):对 `tests/golden/baseline/skills-en/llman-sdd-quick/SKILL.md` 首行前插一个 `X` → `bun test tests/bdd` 失败于 `en 渲染与 en 基线归一化一致`,报错 `golden baseline (skills-en) mismatch: content differs: llman-sdd-quick/SKILL.md`(含文件名);自备份还原(git status 干净)后 83 pass / 0 fail。临时改动未提交
  - 三类差异均含文件名报错:missing file / extra file / content differs

- [x] T3: `llmanspec/AGENTS.md` 事实纠偏(design D3,对应 D-1…D-8)[blocked-by: T0]
  - 范围:仅托管块外;每条改写在本任务注释附事实依据(路径 / 命令输出一行)
  - D-1/D-2/D-3 项目定位改写——依据:`ls ../llman/crates/llman-sdd` → No such file or directory;`ls ../llman.old-rs-impl-sdd/crates/llman-sdd` → build.rs Cargo.toml locales src templates;`llmanspec/changes/archive/2026-09-17-release-v2-and-cutover/` 已归档;`bun apps/cli/src/main.ts list` → `Active changes: align-docs-and-gates full …`(实时推断,过程性 Phase 叙述删除)
  - D-4/D-5 范围决策改写——依据:`llmanspec/specs/change-lifecycle.feature:171`(r68 `change start --worktree`)与 `:190`(r69 finalize/archive worktree 感知)为现行合约;`bun apps/cli/src/main.ts change checkpoint` → `Error: error: unknown command 'checkpoint'`(无任何 stub);`show --help` 列出 `--output json|compact-json|meta-only|no-scenarios|deltas|reqs-only`(r53 现行,peripheral-commands.feature:71)
  - D-6 BDD 行数描述删除——依据:`wc -l < tests/bdd/runner.ts` → 270(行数描述失真,直接删除)
  - D-7 worktrunk 生命周期改写——依据:change-lifecycle.feature:19(r15:finalize MUST 校验当前分支 == binding.branch,故在 change worktree 内执行)与 :190(r69:目标分支被干净 main worktree 持有时在该 worktree 完成合并)
  - D-8 门禁行改写——依据:本变更 T1 后 justfile `qa` recipe 已聚合 golden:check + pending-gate + check:schema,`just qa` 即全集
  - 判据实测:`rg "worktree 并行 change|Rust llman 0.0.x 承载|~200 行|回 main worktree|报错\+指引|../llman/crates"` 零命中;`rg "llman.old-rs-impl-sdd"` 恰命中 1 处(line 16);托管块与 `git show main:` 逐字节相同(cmp 通过)

- [x] T4: 根 AGENTS.md 与 README 门禁描述(design D3 末两条)[blocked-by: T1]
  - 完成判据实测:`rg -n "四门" AGENTS.md README.md` 零命中;README 门禁表新增 `pending-gate`(`bun run pending-gate`)与 `check:schema`(`bun run check:schema`)两行,并注明 `just qa` = CI 聚合全集;根 AGENTS.md 仅改项目速览常用命令一行,托管块零触碰;`bun run format:check` 退出 0

- [x] T5: 全门禁[blocked-by: T1, T2, T3, T4]
  - 命令:`just qa`(此时已含全集)、`CLI validate align-docs-and-gates --strict --no-interactive`、`CLI review`
  - 完成判据:全部退出 0;`validate --all --strict` 若仅报他 spec STALE 按先例记偏差
  - 实测(2026-09-24):`just qa` 退出 0(typecheck/lint/format/test/golden:check/pending-gate/check:schema 七步全绿)

<!-- 收口(change finalize)是流水线步骤而非任务,不列入本清单:finalize 的任务门要求全部任务已勾,列为任务会自相矛盾。 -->
