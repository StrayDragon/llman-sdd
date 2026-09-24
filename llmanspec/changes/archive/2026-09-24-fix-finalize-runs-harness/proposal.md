---
depends_on: []
branch: sdd/fix-finalize-runs-harness
base_branch: main
base_sha: 97f46deea6217c8c051182ff0fcb60f862017f61
---

# 收口时真跑验收命令

## Why

`change finalize` 合并前只做规格的文字结构检查。配置了 `bdd.run_command` 时，验收命令仍可能没跑、被嵌套守卫跳过，或用 `--no-check` 关掉，退出码都和通过一样。活规格里已有 `@executable` 场景、却没有配置命令时，收口也会退出 0。于是「收口成功」不能说明例子在这次提交上跑过。

## What Changes

- `change finalize` 与 `change archive` 在合并前，当本次变更需要改规格（`needs_specs_change` 不为 false）且活规格含 `@executable` 场景时：
  - 配置了非空 `bdd.run_command`：执行与 `validate` 相同的那条命令。非零退出或无法启动则中止，不合并不改名。
  - 未配置命令：中止，并说明有可执行场景但没有 `bdd.run_command`。
  - 因 `LLMAN_SDD_HARNESS_ACTIVE=1` 被跳过：中止。跳过不是通过。
- `--no-check` 仍跳过结构检查和验收命令，但输出必须写明验收被跳过，不能只留下和真正跑过相同的成功文案。
- `needs_specs_change: false` 的变更不要求跑验收命令。
- `review` 与 `show` 的校验门继续不跑验收命令（改写 validation r13 里「收口也不得跑」的句子）。
- 模板告诉 agent：收口会自己跑已配置的验收命令，收口前不必再跑一遍；`--no-check` 的跳过说明不是通过。
- 不做命令转发，也不做结果缓存。

## Capabilities

- `change-lifecycle`：收口合并前的验收执行与跳过文案。
- `validation`：r13 不再禁止收口执行 harness。
- `init-generators`：apply / verify 模板与上述行为一致。

## Impact

- 配置了验收命令的仓库，每次需要改规格的收口都会再跑一遍该命令。本仓库即 `bun test tests/bdd`。
- 只有 `@executable`、没有 `bdd.run_command` 的仓库，收口从退出 0 变为失败，直到写上命令或声明 `needs_specs_change: false`。
