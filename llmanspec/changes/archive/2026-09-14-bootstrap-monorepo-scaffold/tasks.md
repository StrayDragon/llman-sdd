# Tasks

测试边界(seam)声明:本 change 无既有 harness seam,新建一个 —— `tests/bdd` 的 Gherkin 步骤边界(驱动 just recipe / git / 文件系统),外加 bun:test 单元 seam。golden 对照是产物级验收,不新造 seam。

- [x] T1 workspace 骨架:根 `package.json`(workspaces / engines / 聚合 scripts)、`.bun-version`、`tsconfig.json`、`packages/core` 与 `apps/cli` 占位包(exports 直指 src)
- [x] T2 工具链门禁 [blocked-by: T1]:`.oxlintrc.json` / `.oxfmtrc.json`(对齐 crystalith 基线)、justfile(`check` = typecheck+lint+format:check;`qa` = check+test)、`.pre-commit-config.yaml`(prek:oxlint / oxfmt --write / whitespace 系)
- [x] T3 BDD runner 移植 [blocked-by: T1]:`tests/bdd/{runner.ts,run.test.ts,features,steps}`,保留 zh-CN 关键字与 `{param}`/`{param:d}` 占位符语义;附一条冒烟 feature 证明 `bun test tests/bdd` 可用
- [x] T4 CLI 骨架 [blocked-by: T1]:`apps/cli` commander 入口(`--version` 走 package.json 版本)+ `scripts/build-binary.ts`(Bun.build compile,版本从 git tag 注入)
- [x] T5 golden 基线 [blocked-by: T2]:临时目录用 v1(`llman sdd init`)以等价 config 渲染 skills 生成物存入 `tests/golden/`,附对照脚本(`diff` 驱动,`--check` 模式退出码非零表漂移)
- [x] T6 CI [blocked-by: T2, T3]:`.github/workflows/ci.yml`(setup-bun + frozen-lockfile;job1 静态门 = typecheck/lint/format:check;job2 = bun test)
