---
name: "llman-sdd-validate"
description: "校验 change 与 specs，给出修复提示。"
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD 校验

校验 change/spec 格式与过期状态。

## 步骤
1. 单个：`llman-sdd validate <id>`；批量：`llman-sdd validate --all`（或 `--changes` / `--specs`）；CI/自动化用 `--strict`。
2. 校验失败时汇总错误，给出最小可执行的修复建议。
{% if bdd_enabled %}
3. **BDD 校验**：
   - 在**绑定分支**上验证 `.feature` Gherkin 与 `@req` / 双写门禁；`.feature` 是 harness 权威——可执行 GWT 只在其中维护。
   - 生命周期门禁：`change start` / `attach`（绑定分支）、`finalize`（收口；自动提交 `archive(sdd): <id>`，`--no-commit` 跳过）/ `diff`（只读）。
   - `llman-sdd validate --specs` 做结构与合约门禁；配置 `bdd.run_command` 时缺省执行该 harness（`--no-check` 跳过，`--check` 为兼容别名），无占位符的命令每次调用至多执行一次。
   - `list --specs --json` 查看 `morphology`（ruleCount / ruleEnforcedCount / rulePendingCount / acceptanceCount / orphanAcceptanceCount）。
   - change JSON 状态字段：`stage`（draft/designed/planned/full）/ `specsLanded` / `needsSpecsChange` / `readyToImplement`（`show --output json`）。
{% endif %}

{{ unit("skills/cli-footer") }}

{{ unit("skills/validation-hints") }}

{{ unit("skills/ethics-governance") }}
