---
name: "llman-sdd-verify"
description: "实施完成后使用。对照规格给出 CRITICAL、WARNING、SUGGESTION。未通过则不归档。"
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Verify

独立核验实现是否忠实满足该 change 的规格合约、人类定理与项目门禁。

> 位于验证阶段：对象必须已提交 specs 且 `readyToImplement=true`（完成信号）。通过 → `llman-sdd-archive`；失败 → 回 `llman-sdd-apply`。

## 硬约束

- **亲自复跑门禁**：必须亲自重跑 `llman-sdd validate <id> --check --strict`（真实 harness 证据）与项目门禁，不得采信实现者报告；结果不符判 CRITICAL。
- **harness 证据必须显式 `--check`**：缺省 `validate` 跳过 harness，缺省结构门的通过不是通过；收口会执行 `specs.check_command`，收口前不必重复跑。
- **只审查不归档**：CRITICAL 归档前必须清零；不得在此直接跑 `change archive`，也不得中途问“是否继续”。

{{ unit("skills/stage-guard") }}

## 双轴独立审查

对比现算 `git diff <merge-base>...HEAD`（`merge-base` 现算，不得用审计用 `base_sha` 截断范围），两轴结论分离呈现、互不掩盖：

1. **合约与定理轴**：对照分支上 `llmanspec/specs/**`、`llmanspec/theorems/` 与 `proposal.md`/`design.md`/`tasks.md`，核对需求语义、边界条件、是否违背只读人类定理（如存在则跑 `llman-sdd theorem check`）。前后对比类证据必须核对在 change 分支上测量。
2. **工程标准轴**：对照 `llmanspec/AGENTS.md` 与架构边界检查重复逻辑、职责错位、泄漏抽象与测试缺失（工具已强制项不重复报）。
3. **只读核验与人审关卡**：可跑 `llman-sdd change diff <id>` 复核变更面；无 CRITICAL 后跑 `llman-sdd review`，退出码为 0 时输出分级报告（CRITICAL / WARNING / SUGGESTION）并宜接 `llman-sdd-archive`。
{% if specs_verify_prompt %}
- 额外要求：{{ specs_verify_prompt }}
{% endif %}

{{ unit("skills/git-native-flow") }}
{{ unit("skills/human-readable-summary") }}
{{ unit("skills/cli-footer") }}

{{ unit("skills/version-drift") }}

{{ unit("skills/validation-hints") }}

{{ unit("skills/structured-protocol") }}
