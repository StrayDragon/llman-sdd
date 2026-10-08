---
depends_on: []
branch: sdd/drop-validate-no-check
base_branch: main
base_sha: 0a872de7cb1ef222527e25596e40108a67ffe5d3
---

# 移除 validate 的 --no-check 兼容旗标并修正模板侧 opt-in 语义残留

## Why

`validate-harness-opt-in` 落地后，`validate` 缺省已不执行 harness，`--no-check` 与缺省语义完全一致，成为冗余旗标——调用它不再传达任何信息，只制造"还有第三个状态"的假象（用户 2026-10 拍板移除）。`change finalize`/`archive` 的 `--no-check` 语义不同（跳过预合并验收、标准错误含 `spec check skipped: --no-check`），**保留不动**。

顺带修正 `validate-harness-opt-in` 遗留的一致性缺口：`propose`/`explore` 模板仍教「配置 check_command 时 validate 缺省执行 harness（`--no-check` 跳过）」的旧语义，与 r13 新口径矛盾，一并同步为 opt-in 表述。

## What Changes

- `apps/cli/src/commands/validate.ts`：删除 `--no-check` option（调用将得到 commander unknown option，退出码 2，符合"已移除面不留 stub"口径）；`makeHarnessGate` 三态注释更新为仅 `--check`。
- `llmanspec/specs/validation.feature` r13：条款删除 `--no-check` 分句；「配置 check_command 时缺省跳过且 check 显式执行」场景删除 `--no-check` 步骤对。
- `llmanspec/specs/init-generators.feature` r70：apply/verify 模板必含声明句中的 `--no-check` 提及移除（以「缺省结构门不是 harness 通过」保留 `不是通过` 标记语义）。
- 测试面：`tests/bdd/steps/validation.ts` 删除 `运行 validate --specs --no-check` 绑定、其余 `validate ... --no-check` 调用点剥除旗标；`tests/bdd/steps/config.ts` 同。
- 注释面：`packages/core/src/config/schema.ts`（"(skip with --no-check)" → 缺省跳过/--check 显式）、`packages/core/src/validation/harness.ts`（触发矩阵注释）、`packages/core/src/review/review.ts`（前代 sweep 注记）。
- 模板面（zh-Hans + en）：apply/verify 移除 `--no-check` 分句并重写「不是通过」标记为「缺省结构门不是通过」；**propose/explore 补修 opt-in 语义残留**（旧「缺省执行 harness（--no-check 跳过）」→「缺省不执行 harness，`--check` 显式执行」）。随之 `init --update` + golden 重生。

## Capabilities

- `validation`：r13 条款与场景。
- `init-generators`：r70 模板必含声明句。
- 模板面（非 live spec）：apply/verify/propose/explore 四技能。

## Impact

- `validate --no-check` 调用将报 unknown option（退出码 2）——本仓测试与既有 skill 文案同步更新，外部调用者需移除该旗标（无代码迁移，纯旗标面收窄）。
- `change finalize/archive --no-check` 行为不变。
- 无 schema 变更、无配置变更、无迁移路径；`LLMAN_SDD_HARNESS_ACTIVE` 守卫与 `--check` 语义不变。
