---
name: "llman-sdd-validate"
description: "Validate llmanspec changes and specs with actionable fixes."
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Validate

Use this skill to validate change/spec format and staleness.

## Steps
1. Validate one item: `llman-sdd validate <id>`.
2. Validate all: `llman-sdd validate --all` (or `--changes` / `--specs`).
3. Use `--strict` for CI-like checks.
4. If validation fails, summarize the errors and propose minimal, concrete fixes.
{% if bdd_enabled %}
5. **BDD checks (Git-native Partitioned SSOT)**:
   - Validate live `.feature` Gherkin and `@req` / dual-write gates on the **bound branch** (Branch binding required).
   - `.feature` is the harness authority — executable GWT lives only in live `.feature`.
   - Change lifecycle gates: `change start` / `attach` (Branch binding), `finalize` (close-out; auto commit `archive(sdd): <id>`, `--no-commit` to skip) / `diff` (read-only).
   - `llman-sdd validate --specs` enforces structural and contract gates; when `bdd.run_command` is configured it also executes that harness by default (`--no-check` skips it, `--check` is a compat alias) and a placeholder-free command runs at most once per invocation (batch-once).
   - Use `list --specs --json` for `morphology` (ruleCount / ruleEnforcedCount / rulePendingCount / acceptanceCount / orphanAcceptanceCount).
   - Change JSON status fields: `stage` (draft/designed/planned/full) / `specsLanded` / `needsSpecsChange` / `readyToImplement` (`show --output json`).
{% endif %}

{{ unit("skills/cli-footer") }}

{{ unit("skills/validation-hints") }}

{{ unit("skills/ethics-governance") }}
