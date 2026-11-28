# Tasks: add-human-theorems-and-lean-skills

> 验收 Seam：① `packages/core/src/theorems/theorems.ts` 纯域解析/校验/哈希封签单测 + `llman-sdd theorem list/check/lock/unlock` CLI 集成测试（由 `validation.feature` 与 `init-generators.feature` 新规则嵌套场景驱动）；② Studio `/api/bootstrap` & `/api/search` 定理只读加载与前端只读预览抽屉 + 精简后 4 份核心技能模板（相对 merge-base 净降 `>= 20%` 字节数、STC 基线不升、全量 `just qa` + `just qa-studio-e2e` 全绿）。

- [x] T1 实现纯域人类定理引擎与 CLI `llman-sdd theorem` 子命令：新增 `packages/core/src/theorems/theorems.ts`（解析、校验、`buildTheoremLockManifest`/`verifyTheoremLockManifest`）并导出至 `packages/core/src/index.ts`；新增 `apps/cli/src/commands/theorem.ts`（`list`/`check [--run-gates]`/`lock [--root]`/`unlock`）并挂载至 `apps/cli/src/program.ts`；落地本仓自举 `llmanspec/theorems/architecture.md` 与 `.theorems.lock.json`；补齐 `tests/unit/theorems.test.ts` 与 `validation` BDD 绑定。

- [x] T2 `[blocked-by: T1]` 接入 Studio 人类定理只读预览与深度检索召回：扩展 `packages/core/src/studio/contracts.ts` 与 `search.ts`（`theorems[]` 只读载荷 + `'theorem'` 检索索引）；在 `apps/cli/src/studio-server/server.ts` 只读加载并索引工作区人类定理；新增前端 `apps/studio/src/components/TheoremsDrawer.tsx`（右锚只读抽屉，与世界线互斥并遵守真言 1）并在 `TopChrome.tsx`/`App.tsx`/`studioStore.ts` 接入。

- [x] T3 `[blocked-by: T2]` 注入人类定理全域只读约束并完成核心 4 份 Skills 瘦身：更新 `llmanspec-agents-stub.md` 与 `units/skills/structured-protocol.md` 注入只读遵循条款；精简 `llman-sdd-propose.md`、`llman-sdd-apply.md`、`llman-sdd-verify.md`、`llman-sdd-archive.md`（保留全部 `r70`/`r66`/`r138`/`r19` 必含标记，在 change 分支相对 merge-base 测量 4 份模板总字节数净降 `>= 20%` 并下调 `scripts/stc-baseline.json`）；运行 `init --update` 与 `generate:skills-template-baseline` 同步产物，补齐 `init-generators` BDD 绑定。

- [x] T4 `[blocked-by: T3]` 全量验证：`just qa`、`bun run build`、`just qa-studio-e2e`、`llman-sdd theorem check`、`llman-sdd validate add-human-theorems-and-lean-skills --strict` 与 `llman-sdd review` 全绿。
