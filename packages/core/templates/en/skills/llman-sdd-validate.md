---
name: "llman-sdd-validate"
description: "Validate changes and specs; suggest actionable fixes."
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Validate

Validate change/spec format and staleness.

## Steps
1. Single item: `llman-sdd validate <id>`; batch: `llman-sdd validate --all` (or `--changes` / `--specs`); use `--strict` in CI/automation.
2. On failure, summarize the errors and propose minimal, concrete fixes.
{% if bdd_enabled %}
3. **BDD checks**:
   - Validate `.feature` Gherkin and `@req` / dual-write gates on the **bound branch**; `.feature` is the harness authority — executable GWT lives only there.
   - Lifecycle gates: `change start` / `attach` (bind branch), `finalize` (close-out; auto commit `archive(sdd): <id>`, `--no-commit` to skip) / `diff` (read-only).
   - `llman-sdd validate --specs` enforces structural and contract gates; when `bdd.run_command` is configured it also executes that harness by default (`--no-check` skips it, `--check` is a compat alias); a placeholder-free command runs at most once per invocation.
   - `list --specs --json` shows `morphology` (ruleCount / ruleEnforcedCount / rulePendingCount / acceptanceCount / orphanAcceptanceCount).
   - Change JSON status fields: `stage` (draft/designed/planned/full) / `specsLanded` / `needsSpecsChange` / `readyToImplement` (`show --output json`).
{% endif %}

{{ unit("skills/cli-footer") }}

{{ unit("skills/validation-hints") }}

{{ unit("skills/ethics-governance") }}
