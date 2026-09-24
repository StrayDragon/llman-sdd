---
name: "llman-sdd-explore"
description: "Explore mode: investigate, clarify requirements, think through problems before acting. No code writing. Use when intent is unclear or analysis comes first."
metadata:
  version: "0.1.0"
---

# LLMAN SDD Explore

Use this skill to think through ideas, investigate problems, or clarify requirements **before** implementation.

**Explore mode is for thinking, not implementing:**
- You MAY read files, search code, and investigate the codebase.
- You MAY create or update planning docs (proposal/design/tasks).
- `llmanspec/specs/**` is **READ-ONLY** — unless the change is already bound to a branch and you are on it; otherwise STOP and suggest `llman-sdd-propose` / `change start`.
- You MUST NOT write application code.

## Pipeline Position

## Branch lifecycle (brief)

**Skill navigation** ≠ **branch lifecycle**. Full diagram: root `AGENTS.md` or the one inside `llman-sdd-propose`.

Hard rules:
1. **First** bind the branch (`change start` / `attach`) → full; **then** land specs (edit and commit `llmanspec/specs/**` on the bound branch).
2. No contract edits → `needs_specs_change: false`. Enter apply when `stage=full` and the specs-landed gate passes; `readyToImplement=true` (all gates green) is the completion signal gating verify/finalize.
3. Close-out: `change finalize` (auto commit `archive(sdd): <id>`; `--no-commit` to skip).
4. **Do not** commit specs on the default branch; if already attached, do not re-run `start`.
5. Worktree (optional): `change start --worktree` creates the branch in a dedicated worktree without hijacking the current checkout (`--base <branch>` records a non-default fork source); finalize runs in place when the target is held by another worktree (location annotated in output).

```mermaid
flowchart LR
    explore["★ llman-sdd-explore"] --> propose["llman-sdd-propose"]
    propose --> apply["llman-sdd-apply"]
    apply --> verify["llman-sdd-verify"]
    verify --> archive["llman-sdd-archive"]

    style explore fill:#fff3cd,stroke:#ffc107,stroke-width:3px
```

> 📍 You are in explore → next is usually `llman-sdd-propose`; small changes (no contract edits) go via `llman-sdd-quick`.

## Stance
- Curious, not prescriptive; grounded in the actual codebase.
- Visual when helpful (ASCII diagrams); hold multiple options and tradeoffs.

## Suggested moves
1. Use `llman-sdd context --task "<task>" --paths "<files>"` to locate relevant specs; read the full text of the specs in its `direct` list (these are the contracts you must understand).
   - Context unavailable → run `llman-sdd index check` first: stale/missing → `llman-sdd index rebuild` (default `pageindex`, no model needed) and retry; still unavailable on a fresh index (`LLMAN_SDD_INDEX_CHAT_MODEL` unset) → fall back to `llman-sdd list --specs` + reading `.feature` files directly — do not loop on rebuild.
2. Clarify the goal and constraints (ask 1–3 questions).
3. **Deep-dive Q&A branch (optional, only on explicit user trigger)**: triggers on "deep-dig" / "grill" / "one at a time" / "nail it down". Walk the decision tree one question at a time:
   - Ask one question at a time, with your recommended answer; wait for feedback before the next.
   - Facts vs decisions: verify anything checkable by reading the `.feature`/code/running commands yourself — **don't ask** the user; only decisions (tradeoffs, preferences, scope boundaries) go to the user.
   - Terminology sharpening: when a term conflicts or is fuzzy, call it out immediately ("your spec defines 'X' as A, but you just said B — which is it?"); on resolution: if the change is branch-bound and you are on the bound branch, update the `.feature`; otherwise record only in `proposal.md` — never edit specs on the default branch. MUST NOT create a `CONTEXT.md` glossary as a second authority.
   - Write decisions back: resolved decisions go into the change's `proposal.md` "Open Questions" section.
   - Completion criterion: every pending decision is resolved or explicitly deferred. When not triggered, the default (ask 1–3 questions) behavior is unchanged.
4. If a change id is relevant, read its artifacts under `llmanspec/changes/<id>/`.
   - When diagnosing validation errors, run `llman-sdd validate <spec> --strict` first for the structural gates (Gherkin / `@req` linkage / dual-write / req_id uniqueness); when `bdd.run_command` is configured, validate executes that harness by default (`--no-check` skips it). Failing items are pinned down in the default TOON output's `items[].issues[]`; `--output human` prints `FAIL <item_type>/<id>` lines.
5. Explore options and tradeoffs (2–3 options).
6. Assess change scale to determine if full SDD is needed.
7. When something crystallizes, offer to capture it (don't auto-write):
   - Scope / design / work items → planning docs (`proposal.md` / `design.md` / `tasks.md`)
   - Constraints / executable harness → **suggest** `llmanspec/specs/**`; actual edits require a bound branch. If not bound yet, record only in proposal.

## Exiting explore mode
- Behavioral contract change → `llman-sdd-propose`
- Small change / no contract change → `llman-sdd-quick`
- change already landed specs (`stage=full`, specs-landed gate green) → `llman-sdd-apply`
If the user asks you to implement while in explore mode, STOP and remind them to exit explore mode first.

> For command details run `llman-sdd <cmd> --help`; the CLI is the command reference — skills embed no command tables.
> "Spec" here = a `.feature` file under this project's `llmanspec/specs/`; run `llman-sdd list --specs` or `llman-sdd show <capability>`.

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
