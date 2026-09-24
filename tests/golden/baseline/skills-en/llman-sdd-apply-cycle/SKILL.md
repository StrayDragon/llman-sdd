---
name: "llman-sdd-apply-cycle"
description: "End-to-end closed loop for one change: implement→test→validate→verify→archive. Manual trigger only; agent must not auto-invoke."
metadata:
  version: "0.1.0"
disable-model-invocation: true
---

# LLMAN SDD Apply Cycle

End-to-end closed loop for one change (manual). Requires a bound branch and a green specs-landed gate (`specsLanded ∨ needsSpecsChange=false`); `readyToImplement=true` (the completion signal) closes the cycle.

**Manual trigger only**: `/skill:llman-sdd-apply-cycle <change-id>`

## Workflow

### 0) Gate + status
```bash
llman-sdd show <change-id> --output json --type change
```
> Stage decisions use the `stage` / `readyToImplement` fields; the full decision table lives in llman-sdd-apply.

- Must be on the bound non-default branch.
- specs-landed gate failing → STOP (land specs or `needs_specs_change: false`). Green but `readyToImplement=false` → normal: tasks pending, keep implementing; **finalize only when `readyToImplement=true`**.
- Track progress via `tasks.md` checkboxes (or `llman-sdd list` task counts); still read `tasks.md`, proposal/design, and `llmanspec/specs/**` on the bound branch (the single source of truth).

### 1) Loop: implement → test
For each incomplete task:
1. Implement per task + specs (minimal diff)
2. Run the task's stated verification command when the task text names one
3. On failure, fix and retry (same self-repair budget as `llman-sdd-apply`: cap 8 rounds)
4. Check off `tasks.md` as `[x]`

### 2) Validate
```bash
llman-sdd validate <change-id> --strict
```
On failure, fix and retry (cap 8 rounds).

### 3) Verify (recommended)
Prefer `llman-sdd-verify` (or an equivalent dual-axis self-check). CRITICAL → STOP; do not archive.

### 4) Archive + commit
```bash
llman-sdd change finalize <change-id>
```
Dirty tree OK; auto merge (squash default) + rename + **auto commit** `archive(sdd): <change-id>` in one process. `--no-commit` skips the auto commit (manual/CI histories) — then commit with `git add -A && git commit -m "archive(sdd): <change-id>"`. Plain `change archive` stays as a fallback.

### 5) Optional cleanup
```bash
git branch -D <feature-branch>   # after squash the branch is no longer an ancestor of main; -d gets refused
```
Push / PR only when the user explicitly asks.

## Hard constraints
- **Never ask** "should I continue" unless blocked.
- **Never switch** changes until this one is archived and committed.
- **Do not** author `changes/<id>/specs/`; **no default push/PR**.

## Ethics Governance
- `ethics.risk_level`: medium
- `ethics.prohibited_actions`: implementing without a bound branch / a green specs-landed gate, archiving without `readyToImplement=true`, switching changes early, writing `changes/<id>/specs/`, committing without validation, default push/PR
- `ethics.required_evidence`: `readyToImplement=true`, validate --strict pass, all tasks checked, finalize/archive success
- `ethics.refusal_contract`: after 8 self-repair rounds still failing, report a blocker; never force-archive
- `ethics.escalation_policy`: if changing SDD workflow specs/templates, pause for user confirmation before archive

> For command details run `llman-sdd <cmd> --help`; the CLI is the command reference — skills embed no command tables.
> "Spec" here = a `.feature` file under this project's `llmanspec/specs/`; run `llman-sdd list --specs` or `llman-sdd show <capability>`.
