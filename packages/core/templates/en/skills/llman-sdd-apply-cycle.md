---
name: "llman-sdd-apply-cycle"
description: "Single closed-loop for one change: gate→implement→test→validate→verify→archive→commit. Manual trigger only. Agent MUST NOT auto-invoke."
metadata:
  version: "{{ llman_version }}"
disable-model-invocation: true
---

# LLMAN SDD Apply Cycle

End-to-end closed loop for one change (manual). Requires Branch binding and a green specs-landed gate (`specsLanded ∨ needsSpecsChange=false`); `readyToImplement=true` (the completion signal) closes the cycle.

**Manual trigger only**: `/skill:llman-sdd-apply-cycle <change-id>`

## Workflow

### 0) Gate + status
```bash
llman-sdd show <change-id> --output json --type change
```
> Stage gate: decide from `stage` / `readyToImplement` in `llman-sdd show <id> --output json --type change`; full decision table lives in llman-sdd-apply.

- Must be on the bound non-default branch.
- specs-landed gate failing → STOP (finish Specs landing or `needs_specs_change: false`). specs-landed gate green but `readyToImplement=false` → normal: tasks pending, proceed implementing; **finalize only when `readyToImplement=true`**.
- Track progress via `tasks.md` checkboxes (or `llman-sdd list` task counts); still read `tasks.md`, proposal/design, and live `llmanspec/specs/**` on the bound branch (SSOT).

### 1) Loop: implement → test
For each incomplete task:
1. Implement per task + live specs (minimal diff)
2. Run the task's stated verification command when the task text names one
3. On failure, fix and retry (same self-repair budget as `llman-sdd-apply`: cap 8 rounds)
4. Check off `tasks.md` as `[x]`

### 2) Validate
```bash
llman-sdd validate <change-id> --strict
```
On failure, fix and retry (same self-repair budget as `llman-sdd-apply`: cap 8 rounds).

### 3) Verify (recommended)
Prefer `llman-sdd-verify` (or equivalent dual-axis self-check). CRITICAL → STOP; do not archive.

### 4) Archive
```bash
llman-sdd change finalize <change-id>
```
(dirty tree OK; auto merge (squash default) + docs rename + **auto commit** `archive(sdd): <change-id>` in one process. `--no-commit` skips the auto commit for manual/CI histories — then commit with `git add -A && git commit -m "archive(sdd): <change-id>"`.)

The plain `change archive` command stays as a fallback.

### 5) Commit (see step 4)
Finalize already auto-committed unless `--no-commit` was passed.

### 6) Optional cleanup
```bash
git branch -D <feature-branch>   # after squash the branch is no longer an ancestor of main; -d gets refused
```
push / hosting PR only when the user explicitly asks.

## Hard constraints
- **Never ask** "should I continue" unless blocked.
- **Never switch** changes until this one is archived and committed.
- **Retry cap**: self-repair follows `llman-sdd-apply`'s 8-round budget (including the diagnose escalation path).
- **Do not** author `changes/<id>/specs/`.
- **No default push/PR**.

## Ethics Governance
- `ethics.risk_level`: medium
- `ethics.prohibited_actions`: implementing without Branch binding / a green specs-landed gate, archiving without `readyToImplement=true`, switching changes early, writing `changes/<id>/specs/`, commit without validation, default push/PR
- `ethics.required_evidence`: `readyToImplement=true`, validate --strict pass, all tasks checked, finalize/archive success
- `ethics.refusal_contract`: after 3 gate/validation failures, report blocker; do not force-archive
- `ethics.escalation_policy`: if changing SDD workflow specs/templates, pause for user confirm before archive

{{ unit("skills/cli-footer") }}
