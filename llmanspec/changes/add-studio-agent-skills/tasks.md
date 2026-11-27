# Tasks: add-studio-agent-skills

> 验收 Seam：① `packages/core/templates/zh-Hans/skills/` 2 份新 Studio 模板 + `init-generators.feature` 新规则嵌套场景经 `tests/bdd/steps/init.ts` 驱动；② `check:stc`（双模板 0 错误）、`template-command-parity`、`template-guidance-parity`、`check:skills-template-render` 与全仓 `just qa`。

- [ ] T1 编写并注册 2 份 0-STC Studio 协作技能模板：新增 `packages/core/templates/zh-Hans/skills/llman-sdd-studio-onboard.md` 与 `llman-sdd-studio-collab.md`；在 `packages/core/src/templates/skills.ts` 注册至 `OPTIONAL_SKILL_FILES`，在 `scripts/stc-baseline.json` 登记基线 `0`。

- [ ] T2 `[blocked-by: T1]` 同步渲染产物、golden 基线与测试绑定：更新 `tests/unit/templates.test.ts`（17 → 19），在 `tests/bdd/steps/init.ts` 绑定新规则场景，运行 `llman-sdd init --update` 与 `bun run generate:skills-template-baseline` 刷新 `.agents/skills/` 与 `tests/golden/baseline/`。

- [ ] T3 `[blocked-by: T2]` 全量验证：`just qa`（含 `check:stc`、`check:skills-template-render`、命令面与强度词门禁）、`bun run build` 与 `llman-sdd validate add-studio-agent-skills --strict` 全绿。
