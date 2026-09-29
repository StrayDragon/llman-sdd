# tasks

测试边界（seam）：两条既有 harness seam，不发明新边界——

1. 纯函数 `nextReqId`（`packages/core/src/report/specHelpers.ts`，IO 注入；既有 `tests/unit/report.test.ts` 单测 seam）。
2. CLI 子进程（`tests/helpers/spawn.ts` 的 `runCli`；既有 BDD 场景 seam，绑定在 `tests/bdd/steps/output-contract.ts` / `peripheral.ts`）。

## t1 核心取号语义翻转（core + unit）

- [x] `nextReqId` 改为 max+1：注册表最大已用号 + 1，空注册表 r1；实现注释由「前代 parity（smallest free）」改写为有意 divergent 记录（引用 issue #5 与本 change 的 design.md）
- [x] `tests/unit/report.test.ts` 的 `nextReqId` describe 重写为 max+1 断言：空表 → r1；仅有 r5 → r6；**空缺回归锁**：r1 与 r5 共存 → r6（不复用 r2-r4，即 issue #5 的 bug 形态）；step 文本中的 `@req:r99` 仍不计入注册表
- [x] 验证：`bun test tests/unit/report.test.ts` 通过

## t2 CLI 文案 + BDD 场景落地与回归锁（cli + specs + bdd）

- [blocked-by: t1]
- [x] `apps/cli/src/commands/spec.ts`：`next-req-id` 的 description 由 "Allocate the next free global req id (rN)" 改为 max+1 措辞（英文）
- [x] `llmanspec/specs/peripheral-commands.feature` r22 既有场景的 then 步骤文案「输出下一空闲 id」改为 max+1 措辞，并与 `tests/bdd/steps/output-contract.ts` 中同名绑定同步（文本必须逐字一致）；r55 场景（`--json` 形状）不动
- [x] 同文件 r22 新增空缺回归场景：假如 一个已初始化且含 r1 与 r5 规则的临时仓库 / 当 运行 spec next-req-id / 那么 输出 r6 而非复用空缺号 r2；在 `tests/bdd/steps/` 补齐对应的 given/when/then 绑定（临时仓库按既有 given 模式构造，`@req` 句柄经 `规则:` 块头写入）
- [x] 验证：`bun test tests/bdd` 通过（含新回归场景被执行而非跳过）
- [x] 验证：`bun run check:skills-template-render` 无漂移（模板措辞未动；若漂移则在绑定分支运行 `init --update` 并提交 `.agents/skills` 刷新）
- [x] 验证：`llman-sdd validate align-next-req-id-max-plus-one --strict` 全绿（含 specs.check_command BDD 批；不得以 `--no-check` 取证）
