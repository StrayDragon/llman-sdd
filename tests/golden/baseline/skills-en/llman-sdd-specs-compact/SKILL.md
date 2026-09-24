---
name: "llman-sdd-specs-compact"
description: "Compact and dedupe specs: merge redundant requirements/scenarios without changing normative behavior. Manual run only, when the user explicitly asks."
metadata:
  version: "0.1.0"
---

# LLMAN SDD Specs Compact

Compact specs without changing normative behavior. Maintenance tool, not part of the daily pipeline; typically run after many archived changes.

## Context
- Specs bloat with duplicate requirements/scenarios as changes accumulate; compaction must stay verifiable and regressible.
- An oversized archive history interferes with compaction review and navigation.

## Goal
- Merge redundant requirements/scenarios into a more compact, maintainable spec structure.

## Constraints
- Don't delete normative behavior without explicit replacement; keep requirement titles stable where possible; every retained requirement keeps at least one valid scenario.
- **Editing `llmanspec/specs/**` requires a change**: bind the branch first (`change start` / `attach`), then edit and commit on the bound branch; **never** compact-rewrite specs on the default branch.

## Workflow
1. Inventory specs (`llman-sdd list --specs`).
2. If archived history is large, freeze first: preview `llman-sdd archive freeze --dry-run`; execute `llman-sdd archive freeze --before <YYYY-MM-DD> --keep-recent <N>`.
3. Identify cross-capability overlap (duplicate req ids across specs: `llman-sdd project dedupe-req-ids --dry-run` reports the remap plan).
4. Produce a compaction plan (canonical requirements + keep/merge/remove decisions + migration notes).
5. Execute and validate (`llman-sdd validate --specs --strict`).

## Decision Policy
- Prefer merging semantically equivalent requirements; extract shared text only when references are clear; freeze first when the archive is noisy.
- If compaction would change external behavior, pause and ask the user first.

## Output Contract
- Compaction plan grouped by capability: keep/merge/remove decisions with rationale + validation commands and expected results.

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

## Ethics Governance
- `ethics.risk_level`: low — reads/writes this repo and `llmanspec/` only, no outward-facing actions; a skill body may override.
- `ethics.prohibited_actions`: actions violating the skill body's hard rules; push / PR / external upload without an explicit user request.
- `ethics.required_evidence`: conclusions backed by command output or file paths; gate state per `llman-sdd validate`.
- `ethics.refusal_contract`: gate CRITICAL not cleared → refuse to advance; self-repair cap reached → report a blocker.
- `ethics.escalation_policy`: pause and ask the user before changing SDD contracts/templates or irreversible actions.
