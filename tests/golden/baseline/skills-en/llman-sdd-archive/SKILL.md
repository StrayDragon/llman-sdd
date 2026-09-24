---
name: "llman-sdd-archive"
description: "Archive a completed change: merge back (squash default), rename docs into archive/, auto-commit the close-out. Run after verify is green."
metadata:
  version: "0.1.0"
---

# LLMAN SDD Archive

Archive completed changes. Prerequisites: verify all-green, and the change is branch-bound with specs landed (or `needs_specs_change: false`). `change finalize` **auto-merges** into the base branch (target: `--into` > binding `base_branch` > default branch; method: `--method` > config `sdd.merge_method`, squash by default — feature diff + rename collapse into ONE commit on the target), **renames** change docs into `changes/archive/`, then **auto-commits** `archive(sdd): <change-id>` (`--no-commit` skips). `git push` / PR are optional.

## Pipeline Position

```mermaid
flowchart LR
    verify["llman-sdd-verify"] --> archive["★ llman-sdd-archive"]

    style archive fill:#fff3cd,stroke:#ffc107,stroke-width:3px
```

> 📍 You are in archive: the last stop of the branch lifecycle. If specs grow too large, run `llman-sdd-specs-compact`.

## Hard Constraints

- **Verify must be all-green first**; **the change must be branch-bound** (`change start` / `attach`) — otherwise STOP.
- Every change must pass `llman-sdd validate <id> --strict` before archiving.
- **Don't ask "should I continue?"**: execute the full batch to completion unless you hit an unresolvable error.
- **Close-out MUST NOT default to PR/push**: the CLI merges locally (squash default) + one close-out commit. Push / PR only when the user or project explicitly requires remote review — **Agent MUST NOT** push or open a PR by default.

## Steps

### 0) Preflight
- `git status --porcelain`: confirm working-tree changes belong to completed changes; handle unexpected ones first (stash or report).

### 1) Confirm targets
- Determine IDs (single or batch, from user input or `llman-sdd list --json`); always announce "Archiving IDs: <id1>, <id2>, ..." and confirm each change is verify all-green.

### 2) Archive one by one
- **Human review gate (before each id, including batches)**: run `llman-sdd review` (plain; `--capability` takes a spec id only). Exit code zero → continue; non-zero = CRITICAL → STOP, fix, re-run; MUST NOT archive with CRITICAL findings open.
- Validate first: `llman-sdd validate <id> --strict`; failure → STOP and report, never force-archive.
- Optional preview: `llman-sdd change archive <id> --dry-run`.
- Execute: `llman-sdd change archive <id>`; **stop immediately on first failure** and report the remaining IDs.
- **Branch close-out**:
  - Prerequisites: branch bound; still on the bound branch (or on the target branch after the auto merge).
  - `change archive` / `change finalize` run the **auto merge** (target `--into` > `base_branch` > default branch; method squash by default or `ff`; when the target is held by another worktree the merge and commit run in place inside it, with `executed in target worktree <path>` in the output; a dirty holding worktree aborts with disposal options and zero writes), **then** rename into `changes/archive/` — the rename is never rolled back on merge failure and degradation is reported explicitly.
  - **Default: `change finalize` (one-command close)** — gates → merge → rename → **auto commit** `archive(sdd): <change-id>` (no manual `git commit` needed; locked-rule edits are a report-only WARNING — warn, never block):
    ```text
    1. Implement specs + code (working tree may stay dirty; commits on the branch are free)
    2. llman-sdd change finalize <id>    # gates + merge (squash default) + rename + auto commit
    3. optional: git commit --amend to adjust the message; git branch -D <feature>  # after squash the branch is no longer an ancestor; -d gets refused
    ```
    `--no-commit` skips the auto commit (CI / pre-commit-hook conflicts): finalize leaves the tree dirty and prints the manual commit command. Idempotent retry: a rerun after a failed auto commit detects the already-archived rename and finishes the commit.
  - **Fallback: plain `change archive <id>`** — same auto merge + rename + close-out commit as finalize (no `--no-commit` here); gates: tasks all checked + clean tree + on the bound non-default branch (`--force` skips the gates). Snapshot review: `change diff`.

### 3) Full validation
- After all archives: `llman-sdd validate --all --strict`; confirm spec artifacts are consistent.

### 4) Commit guidance
- Finalize already auto-committed; with `--no-commit`, commit manually: `git add -A && git commit -m "archive(sdd): <id1>, <id2>"`.
- Optional: `git branch -D <feature>` after the merge. Push / PR only when explicitly required.
- **Breaking contract changes** (removed/renamed frontmatter field, command, tag, or stage value) MUST ship an upgrade path under `migrations/v<from>-v<to>/` (README + one-shot script, shipped in-repo) — verify it exists before closing.
- **Archived `depends_on`**: archive renames the change dir to `archive/YYYY-MM-DD-<id>`; validate treats `depends_on` pointing to archived/frozen ids as INFO (not ERROR), so you do **not** need to update other changes' frontmatter after archive.

## Archive Cold Backup Guidance
- When archived directories grow too large, use cold backup maintenance:
  - Preview freeze candidates: `llman-sdd archive freeze --dry-run`
  - Freeze old archives: `llman-sdd archive freeze --before <YYYY-MM-DD> --keep-recent <N>`
  - Restore when needed: `llman-sdd archive thaw --change <YYYY-MM-DD-id>`
- Apply freeze/thaw only to dated archive directories (`YYYY-MM-DD-*`); keep a small recent window unfrozen.
- Running outside the main checkout (a worktree not holding the default branch) prints a warning (never blocks) — continue there only intentionally.

> For command details run `llman-sdd <cmd> --help`; the CLI is the command reference — skills embed no command tables.
> "Spec" here = a `.feature` file under this project's `llmanspec/specs/`; run `llman-sdd list --specs` or `llman-sdd show <capability>`.

Validation fixes (single-track feature-as-spec):

1) Missing header comments (`missing # capability: header comment`): every capability `.feature` (`llmanspec/specs/<capability>.feature` or the same-named main file in a directory) MUST start with:
```
# language: zh-CN
# capability: <capability>
# purpose: One-line overview.
# scope: src/
```

2) Tag grammar (`@human constraint scenario must carry an @req:<req_id> tag` / `orphan acceptance scenario`):
- Rules: `@req:<id> @human` — statement verbatim in the scenario description (MUST/SHALL required).
- Acceptance: `@executable` + at least one `@req:<id>` linking a rule.
- Pairing triage: before adding an `@human` rule — any GWT-expressible automatable behavior MUST land as an `@executable` acceptance linked back to the rule (prose-only rules guard nothing); `@human` is for non-automatable human judgment only; record the justification in proposal/design when no pairing is possible.
- Never combine `@human` with `@executable`; `@manual` was removed in 0.3.0 — leftovers report a migration ERROR, just drop the tag (`@human` already carries the human-judgement semantics).

Branch guardrail:
- First `change start` / `attach` to bind the branch, then edit `.feature` on the bound non-default branch and commit (land specs).
- Locked rules (report-only): editing/removing an existing `@human` scenario yields a WARNING and never blocks validate / finalize / `change diff`; the report names the rule by `@req:<id>`. Control points: git branch diff plus `llman-sdd review` / `change diff`. Legacy lock-ack metadata (frontmatter `rules_touched` / `agent_acked`, the `@agent` tag, the `--yes` ack semantics) is fully removed — no aliases, no compat layer.
- Enter apply when `stage=full` and the specs-landed gate passes (specsLanded ∨ `needs_specs_change: false`); verify/finalize require `readyToImplement=true` (completion signal). Close-out prefers `change finalize`.

## Context
- Check state before acting: change/spec status comes from `llman-sdd show/list/validate`; locate relevant specs with `llman-sdd context --task --paths` before reading spec files.

## Goal
- Reach one verifiable outcome; report result paths and validation state.

## Constraints
- Follow the skill body's hard rules (not repeated here). Classify first: behavior-contract changes take the full SDD path, implementation-only changes take quick; when unsure choose full SDD. Keep changes minimal; never force past a known validation failure.

## Workflow
- Treat `llman-sdd` command output as the source of truth at every step; run `llman-sdd validate` after touching artifacts. Command details: `llman-sdd <cmd> --help`.

## Decision Policy
- Clarify high-impact ambiguity before proceeding; verify facts yourself, ask the user only for decisions.

## Output Contract
- Human-readable summary first (verdict / risks / decisions needed), machine detail after.

## Ethics Governance
- `ethics.risk_level`: low — reads/writes this repo and `llmanspec/` only, no outward-facing actions; a skill body may override.
- `ethics.prohibited_actions`: actions violating the skill body's hard rules; push / PR / external upload without an explicit user request.
- `ethics.required_evidence`: conclusions backed by command output or file paths; gate state per `llman-sdd validate`.
- `ethics.refusal_contract`: gate CRITICAL not cleared → refuse to advance; self-repair cap reached → report a blocker.
- `ethics.escalation_policy`: pause and ask the user before changing SDD contracts/templates or irreversible actions.
