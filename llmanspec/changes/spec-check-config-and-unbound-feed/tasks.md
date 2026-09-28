# 任务

> 测试边界（seam）：S1 = 配置加载单元面（config.test.ts 同款 YAML 文本→loadConfig）；S2 = CLI 子进程面（tests/helpers/spawn.ts `runCli` / `makeTempRepo().run`，临时仓库 + 真实 CLI）；S3 = golden 对照基线（tests/golden）；S4 = skills 模板渲染门（check-skills-template-render）。全部复用既有 harness，无新 seam。

## T1: 配置 schema 迁移（bdd → specs）

- [ ] 更新 `packages/core/src/config/schema.ts`：`bdd` 段 → `specs` 段（`framework`/`verify_prompt` 随迁、`run_command` → `check_command`）；保留对旧 `bdd:` 段的识别与字段级兼容提升，加载期输出 WARNING 提示改用新形。
- [ ] `config` 命令展示面（packages/core/src/config/surface.ts + apps/cli/src/commands/config.ts）展示 `specs.*`（含 `check_command`）与旧形兼容提示。
- [ ] 单元测试（S1）：新形加载、旧形提升 + WARNING、字段级映射、未知键宽松兼容不回退。
- [ ] 落 specs：config-schema.feature 更新 `specs:` 段字段契约（原 r5），并更新旧 `bdd:` 兼容场景。

## T2: close-out 门收敛

- [ ] 更新 `packages/core/src/change/closeOutHarness.ts`：删除 `hasExecutable` 依赖——`specs.check_command` 已配置时对一切 `needsSpecsChange` 的 change 必跑；未配置 → skip + WARNING 引导（非阻断）。
- [ ] apps/cli/src/commands/change.ts 相应调用点与文案更新（`bdd harness` → `spec check` 文案族）。
- [ ] 单元/BDD 测试（S2/S1）：配置了 check_command 且 specs-touching 的 close-out 必跑；未配置 → WARNING 非阻断；`--no-check` 仍可跳过。
- [ ] 落 specs：validation.feature / change-lifecycle.feature 相关 close-out 门行为条款更新。

## T3: validate harness 文案与聚合 INFO 收敛

- [ ] `packages/core/src/validation/harness.ts` 与 CLI 侧所有「bdd harness」文案 →「spec check」/「spec check harness」（INFO/ERROR 消息、`--help`、close-out 报错族）。
- [ ] validate 聚合 INFO（packages/core/src/validation/validate.ts bare-rule 条）措辞改为「unbound requirement(s) without any runnable scenario — bind via 场景: or compact」语义。
- [ ] 测试（S1/S2）：无 check_command 时 `--check` 的 INFO 文案、明文消息族一致。
- [ ] 落 specs：validation.feature r13/r48 相关条款与文案断言更新。

## T4: 术语与机器字段统一

- [ ] core 侧一致化：`report/specs.ts` morphology 字段 `ruleEnforcedCount → requirementBoundCount`、`rulePendingCount → requirementUnboundCount`（`ruleCount` 视与 `requirementCount` 冗余情况收敛）；`review/review.ts` `pending` 信号 → `unbound`（ReviewKind、输出、HTML）。
- [ ] 「未绑定」判定统一为 runnable 口径：morphology 的 bound/unbound 计数、review unbound 信号、validate 聚合 INFO 同口径（嵌套场景全 `@skip/@experimental` 计入 unbound）。
- [ ] `list --specs` / `show --json` 字段输出与文档更新；pending-gate 脚本（scripts/pending-gate.ts）字段引用与失败文案更新；golden 基线（S3）刷新。
- [ ] 落 specs：peripheral-commands.feature（morphology 字段/语义）、review-freeze.feature（unbound 信号）、mono-repo-structure / 校验相关条款。

## T5: `spec unbound` 命令

- [ ] core 检索逻辑：按 runnable 口径聚合未绑定需求（requirement id/title/statement + capability + featurePath），确定性排序（文件扫描序 + 文件内规则序）。
- [ ] limit 契约：缺省 1，`--limit 0` = 全部；TOON/JSON/compact-json/human 输出模式统一生效；输出含 returned/remaining/total 与提示字段。
- [ ] CLI 注册（apps/cli/src/commands/spec.ts）：`spec unbound [--limit N]` 子命令 + 输出旗标共享注册。
- [ ] BDD 测试（S2）：缺省 1 + 省略号 + 剩余数 + 提示；`--limit`/`--limit 0`；未绑定定义（含全 `@skip` 场景规则计入）；JSON 字段形状；排序确定性。
- [ ] 落 specs：peripheral-commands.feature 新增 `spec unbound` 命令面契约（含输出契约条）。

## T6: 模板变量与 skills

- [ ] `packages/core/src/templates/skills.ts` 变量 `bdd_enabled/bdd_framework/bdd_run_command/bdd_verify_prompt` → `specs_*` 对应；templates（zh-Hans/en）`llman-sdd-validate.md`/`llman-sdd-verify.md` 引用更新。
- [ ] `init --update` 刷新 `.agents/skills` 并提交；golden 基线（S3/S4）刷新。
- [ ] 落 specs：init-generators.feature 模板变量契约更新。

## T7: migration 升级提示

- [ ] `migrations/v0.5-v0.6/README.md`：`bdd.*` → `specs.*` 键迁移说明（含 `run_command`→`check_command` 映射、兼容提升期与未来移除预期）。
