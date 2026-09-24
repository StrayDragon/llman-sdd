---
name: "llman-sdd-verify"
description: "Verify that an implemented llman SDD change matches its specs, design, and tasks. Produces a report (CRITICAL / WARNING / SUGGESTION) comparing code to artifacts. Run after apply completes. If clean, the change is ready to archive."
metadata:
  version: "0.1.0"
---

# LLMAN SDD Verify

Use this skill to verify that the implementation matches the change's artifacts.

## Pipeline Position

### Skill navigation (not the lifecycle; shows current skill only)

```mermaid
flowchart LR
    apply["llman-sdd-apply<br/>Implement"] --> verify
    verify["★ llman-sdd-verify ★<br/>Verify (you are here)"]
    verify --> archive["llman-sdd-archive<br/>Archive"]

    style verify fill:#fff3cd,stroke:#ffc107,stroke-width:3px
```

> 📍 You are in the verify phase → if pass: next `llman-sdd-archive` (archive); if fail: go back to `llman-sdd-apply` (fix). This is Git-native **I (verify)**; the change should already be Specs-landed with `readyToImplement=true` (all gates green — the completion signal).
> 🗺️ Skill navigation ≠ Git-native lifecycle; see brief lifecycle unit at the bottom.

## Hard Constraints

- **Must pass apply phase all-green first**: don't skip to verify on changes that haven't been implemented.
- **CRITICAL issues must be fixed**: CRITICAL problems must be resolved before archive.
- **Rerun the gates yourself**: MUST rerun `llman-sdd validate <id> --strict` (real harness) and the project gates; MUST NOT trust gate verdicts in the implementer's report — a mismatch is CRITICAL.
- **`--no-check` is not evidence**: gate evidence obtained with `--no-check` → CRITICAL. Close-out runs the configured `bdd.run_command`, so do not run that command again just before close-out; the skip line printed by `--no-check` is not a pass.
- **Don't ask "should I continue?"**: run the full verification flow, output a complete report.

## Stage guard (`stage` / `readyToImplement`)

Decide from authoritative JSON (never from vague "complete artifacts" wording):

```bash
llman-sdd show <id> --output json --type change
```

Read: `stage`, `specsLanded`, `needsSpecsChange`, `readyToImplement`, `gateChecks` (per-item `pass` + one-line `hint` when failing).

| Condition | Action |
|-----------|--------|
| `stage=draft` (proposal.md only) | STOP. Grow to Designed (add design.md) → Planned (add tasks.md) → Branch binding → Specs landing. Draft cannot apply/verify. If proposal+tasks exist but stage is still `draft` (tasks-without-design — design.md gates the stage): add design.md first. **Do not** create `changes/<id>/specs/`; **do not** edit live specs on the default branch first. |
| `stage=designed` (proposal + design) | Next: add tasks.md → `planned`. Run `change start` / `attach` (Branch binding) only after planning artifacts are complete. |
| `stage=planned` (proposal + design + tasks) | STOP until binding: run `change start` / `attach` (Branch binding) → `full`. |
| `stage=full` and `readyToImplement=false` | Read the failing `gateChecks` items. specs-landed gate failing → finish Specs landing on the **bound branch** (edit `llmanspec/specs/**` and commit), or set `needs_specs_change: false`; **do not** re-run `change start` (lost bound-branch specs → checkout/recreate + `attach --force` if needed). specs-landed gate green but tasks-done/validate/clean-tree failing → normal mid-implementation state: proceed with apply (check off tasks); do not treat it as a landing failure. |
| `readyToImplement=true` | Completion signal: every gateChecks item green (tasks done + validate passed) — verify/finalize prerequisites met. `changes/<id>/specs/` is expected to be **absent** — do not treat as missing. |

## Steps
1. Select the change id (or ask the user to pick from `llman-sdd list --json`).
2. Run a fast validation gate:
   - `llman-sdd validate <id> --strict`
   - **When diagnosing structural issues (Gherkin parse / `@req` linkage / dual-write / global req_id uniqueness), run the structural validation first** (when `bdd.run_command` is configured, validate executes that harness by default — `--no-check` skips it; a harness failure lands as an ERROR on its spec item). Failing items are listed one by one in the default TOON output's `items[].issues[]` (`--output human` prints the v1 text form: `FAIL <item_type>/<id>` lines above the `Totals` line).
3. Read:
   - Live specs on the feature branch: `llmanspec/specs/**` (`<capability>.feature`) — SSOT
   - `proposal.md` and `design.md` if present
   - `tasks.md` to understand what was implemented
   - `llmanspec/changes/<id>/specs/` only if residual old docs exist — ignore; SSOT is live specs
4. **Dual-axis review (Standards + Spec, kept separate so neither masks the other)** — diff against `git diff <merge-base>...HEAD` (merge-base is COMPUTED via `git merge-base <local-default> HEAD`; the stored base_sha is audit-only and MUST NOT feed range math) on two axes:
   - **Spec axis**: does the implementation satisfy the `@human` rule MUST/SHALL and the `@executable` GWT?
     - Missing/partial behaviors, wrong implementations, and scope creep in the diff not asked for by the spec.
     - Suggest minimal fixes or artifact updates.
     - Check where before/after evidence (counts, baselines) was taken: it MUST be measured on the change branch (against the freshly computed merge-base); a value measured on the default branch is usually trivially the baseline and proves nothing.
   - **Standards axis**: does the code follow `AGENTS.md` coding style + the Fowler smell baseline?
     - **Authority priority**: `AGENTS.md` documented standard > smell baseline (repo overrides); skip anything tooling already enforces.
     - Smells are **judgement heuristics** ("possible Feature Envy"), not hard violations.
     - Smell baseline (each "what → fix"):

     | Smell | Fix |
     |-------|-----|
     | Mysterious Name (name hides intent) | rename it |
     | Duplicated Code (same logic shape) | extract the shared part |
     | Feature Envy (method uses another's data more) | move the method over |
     | Data Clumps (same fields travel together) | bundle into a type |
     | Primitive Obsession (primitive stands in for a domain concept) | give it a dedicated type |
     | Repeated Switches (same switch recurs) | polymorphism or a shared map |
     | Shotgun Surgery (one change scatters edits) | gather into one module |
     | Divergent Change (one file changes for unrelated reasons) | split it |
     | Speculative Generality (abstraction for unseen needs) | delete it |
     | Message Chains (long a.b().c()) | hide the chain behind one method |
     | Middle Man (just delegates) | cut it, call direct |
     | Refused Bequest (subclass rejects most inheritance) | use composition |
   - The two axes may be reviewed in parallel (sub-agents); the report MUST present them separately, MUST NOT merge or cross-rerank (one axis passing must not mask the other failing).
5. **BDD-on verification (Git-native Partitioned SSOT)** — only when `config.yaml` has a `bdd:` block:
   - Confirm the change is attached and you are on that feature branch.
   - `llman-sdd validate --specs`: Gherkin + `@req`/dual-write gates; when `bdd.run_command` is configured the harness runs by default (`--no-check` skips it) and a failure maps to an ERROR on the matching spec item.
   - Optional read-only review: `llman-sdd change diff <id>` (or `--export-patch <path>`). Diff is review/export only — never treat it as an apply step.
   - Next step after verify passes: `llman-sdd-archive` (not inline finalize here).

6. Produce a short report:
   - **CRITICAL** (must fix before archive)
   - **WARNING** (should fix)
   - **SUGGESTION** (nice to have)
7. **Human review gate**: once the report has no CRITICAL findings and before suggesting archive, run `llman-sdd review`:
   - Exit code zero → suggest `llman-sdd-archive` for finalize/archive.
   - Non-zero exit = CRITICAL findings: fix via `llman-sdd-apply`, then re-run review; MUST NOT enter finalize/archive with CRITICAL findings open.

> 💡 Verify pass → next: `llman-sdd-archive` (archive); CRITICAL issues → go back to `llman-sdd-apply` (fix)

## Git-native lifecycle (brief)

Do not conflate **skill navigation** with the **Git-native lifecycle**. Full diagram: root `AGENTS.md` or the diagram inside `llman-sdd-propose`.

Hard rules:
1. **First** Branch binding (`change start` / `attach`) → Full; **then** Specs landing (edit and commit `llmanspec/specs/**` on the bound branch).
2. No live contract edits → `needs_specs_change: false`. Enter apply when `stage=full` and the specs-landed gate passes; `readyToImplement=true` (all gates green) is the completion signal gating verify/finalize.
3. Close-out: `change finalize` (auto commit `archive(sdd): <id>`; `--no-commit` to skip).
4. **Do not** commit live specs on the default branch; if already attached, do not re-run `start`.
5. Worktree mode (optional): `change start --worktree` creates the branch in a dedicated worktree without hijacking the current checkout (`--base <branch>` records a non-default fork source); finalize runs in place when the target is held by another worktree (location annotated in output).
# Human-Readable Summary (mandatory)

Every report, handoff, or gate output you produce in this workflow MUST open
with a short human-readable summary block before any machine detail:

- **Verdict** — one line (e.g. "all gates green" / "2 CRITICAL found").
- **Risks** — up to three bullets, highest impact first.
- **Decisions needed** — explicit asks, or "none".

Keep it under ten lines; details belong below the fold.
> For command details run `llman-sdd <cmd> --help`; the CLI is the command reference — skills embed no command tables.
> "Spec" here = a `.feature` file under this project's `llmanspec/specs/`; run `llman-sdd list --specs` or `llman-sdd show <capability>`.

Validation fixes (single-track feature-as-spec):

1) Missing header comments (`missing `# capability:`` header comment`):
Every capability `.feature` (`llmanspec/specs/<capability>.feature` or `llmanspec/specs/<capability>/<capability>.feature`) MUST start with:
```
# language: zh-CN
# capability: <capability>
# purpose: One-line overview.
# scope: src/
```

2) Tag grammar (`@human constraint scenario must carry an @req:<req_id> tag` / `orphan acceptance scenario`):
- Rules: `@req:<id> @human` — statement in the scenario description (MUST/SHALL required).
- Acceptance: `@executable` + at least one `@req:<id>` linking a rule.
- Pairing: before adding an `@human` rule, run the triage — any GWT-expressible automated-verifiable behavior MUST get a paired `@executable` acceptance (prose-only rules guard nothing); `@human` is for non-automatable human judgment only; record the justification in proposal/design when no pairing is possible.
Never combine `@human` with `@executable`. (`@manual` was removed in 0.3.0 — drop it; `@human` already carries the human-judgement semantics.)

Git-native guardrail:
- **Branch binding** → **Specs landing**: first `change start` / `attach`, then edit live `.feature` files on the bound non-default branch and commit.
- Locked rules (report-only): editing/removing an existing `@human` scenario yields a WARNING and never blocks validate / change finalize / change diff; the report names the edited rule by `@req:<id>`. Control points: git branch diff plus `llman-sdd review` / `change diff` output. Legacy lock-ack metadata (frontmatter `rules_touched` / `agent_acked`, the `@agent` tag, the `--yes` ack semantics) is fully removed — no aliases, no compat layer (locked rules are report-only: a warning, never a block).
- Enter apply when `stage=full` and the specs-landed gate passes (specsLanded ∨ `needs_specs_change: false`); verify/finalize require `readyToImplement=true` (completion signal). Close-out prefers `change finalize`.

## Context
- Check state before acting: change/spec status comes from `llman-sdd show/list/validate` output.
- Locate relevant specs with `llman-sdd context --task --paths` before reading spec files.

## Goal
- Reach one verifiable outcome for this command; report result paths and validation state.

## Constraints
- Follow the hard rules in the skill body (not repeated here). Triage first: behavior-contract changes take the full SDD path, implementation-only changes take quick; when unsure choose full SDD.
- Keep changes minimal; never force past a known validation failure.

## Workflow
- Treat `llman-sdd` command output as the source of truth at every step; run `llman-sdd validate` after touching artifacts.
- Command details: the generated command reference below, or `llman-sdd <cmd> --help`.

## Decision Policy
- Clarify high-impact ambiguity before proceeding; verify facts yourself, ask the user only for decisions.

## Output Contract
- Human-readable summary first (conclusion / risks / decisions needed), machine detail after.

## Ethics Governance
- `ethics.risk_level`: low — reads/writes this repo and `llmanspec/` only, no outward-facing actions; a skill body may override.
- `ethics.prohibited_actions`: actions violating the skill body's hard rules; push / PR / external upload without an explicit user request.
- `ethics.required_evidence`: conclusions backed by command output or file paths; gate state per `llman-sdd validate`.
- `ethics.refusal_contract`: gate CRITICAL not cleared → refuse to advance; self-repair cap reached → report a blocker.
- `ethics.escalation_policy`: pause and ask the user before changing SDD contracts/templates or irreversible actions.
