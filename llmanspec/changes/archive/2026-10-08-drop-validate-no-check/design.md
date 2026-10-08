# design: 移除 validate --no-check

## 背景

`validate-harness-opt-in` 后 `validate` 缺省即不执行 harness，`--no-check` 与缺省零差异，纯冗余旗标。用户拍板移除。

## 决策边界

- **只移除 `validate` 的 `--no-check`**。`change finalize`/`archive` 的 `--no-check` 语义独立（跳过预合并验收、stderr 含 `spec check skipped: --no-check`、`--force` 不覆盖它），**保留**。
- 移除后 `validate --no-check` → commander unknown option、退出码 2——符合「已移除命令与选项彻底删除，不保留报错 stub」的定案。
- `makeHarnessGate` 逻辑不变（`--check` → on，其余 → off），仅删 option 声明与三态注释。
- 测试面逐点剥除旗标：夹具无 check_command 的调用本就是 no-op，行为保持；r48/r13 已迁至 `--check`。

## 顺带修复（一致性）

`validate-harness-opt-in` 遗留：propose/explore 模板仍教「缺省执行 harness(--no-check 跳过)」旧语义。本次一并更新为 opt-in 表述，并删 apply/verify 模板中的 `--no-check` 分句——「不是通过/not a pass」parity 标记以「缺省结构门不是通过 / default structural gate is not a pass」保留（该标记原语义即「跳过不算通过」，依然成立且更准确）。
