---
name: "llman-sdd-validate"
description: "校验 llmanspec 变更与 specs 并提供修复提示。"
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD 校验

使用此 skill 校验变更/spec 格式与过期状态。

## 步骤
1. 校验单个条目：`llman-sdd validate <id>`。
2. 批量校验：`llman-sdd validate --all`（或 `--changes` / `--specs`）。
3. 在 CI 或自动化场景中使用 `--strict`。
4. 若校验失败，汇总错误并给出最小、可执行的修复建议。
{% if bdd_enabled %}
5. **BDD 校验（Git-native Partitioned SSOT）**：
   - 在**绑定分支**上验证 live `.feature` Gherkin 与 `@req` / 双写门禁（须已 Branch binding）。
   - `.feature` 是 harness 权威——可执行 GWT 只在 live `.feature` 维护。
   - Change 生命周期门禁：`change start` / `attach`（Branch binding）、`finalize`（收口；自动提交 `archive(sdd): <id>`，`--no-commit` 跳过）/ `diff`（只读）。
   - `llman-sdd validate --specs` 做结构与合约门禁；配置了 `bdd.run_command` 时缺省执行该 harness（`--no-check` 跳过，`--check` 为兼容别名），无占位符的命令整批至多执行一次（batch-once）。
   - 可用 `list --specs --json` 查看 `morphology`（ruleCount / ruleEnforcedCount / rulePendingCount / acceptanceCount / orphanAcceptanceCount）。
   - Change JSON 状态字段：`stage`（draft/designed/planned/full）/ `specsLanded` / `needsSpecsChange` / `readyToImplement`（`show --output json`）。
{% endif %}

{{ unit("skills/cli-footer") }}

{{ unit("skills/validation-hints") }}

{{ unit("skills/ethics-governance") }}
