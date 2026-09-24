---
name: "llman-sdd-verify"
description: "Verify an implemented change against its specs/design/tasks; report CRITICAL/WARNING/SUGGESTION. Run after apply; if clean, ready to archive."
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Verify

Verify that the implementation matches the change's artifacts.

## Pipeline Position

```mermaid
flowchart LR
    apply["llman-sdd-apply"] --> verify["★ llman-sdd-verify"]
    verify --> archive["llman-sdd-archive"]

    style verify fill:#fff3cd,stroke:#ffc107,stroke-width:3px
```

> 📍 You are in verify → pass leads to `llman-sdd-archive`, failure goes back to `llman-sdd-apply`. The change should already have landed specs with `readyToImplement=true` (all gates green — the completion signal).

## Hard Constraints

- **Apply must be all-green first**: don't verify unimplemented changes.
- **CRITICAL must be fixed**: zero CRITICAL before archive.
- **Rerun the gates yourself**: MUST rerun `llman-sdd validate <id> --strict` (real harness) and the project gates; MUST NOT trust gate verdicts in the implementer's report — a mismatch is CRITICAL.
- **`--no-check` is not evidence**: gate evidence obtained with `--no-check` → CRITICAL. Close-out runs the configured `bdd.run_command`, so do not run that command again just before close-out; the skip line printed by `--no-check` is not a pass.
- **Don't ask "should I continue?"**: run the full verification flow and output a complete report.

{{ unit("skills/stage-guard") }}

## Steps
1. Select the change id (or ask the user to pick from `llman-sdd list --json`).
2. Fast validation gate: `llman-sdd validate <id> --strict`.
   - When diagnosing structural issues (Gherkin parse / `@req` linkage / dual-write / req_id uniqueness), run the structural validation first (when `bdd.run_command` is configured, validate executes that harness by default — `--no-check` skips it; a harness failure lands as an ERROR on its spec item). Failing items are listed one by one in the default TOON output's `items[].issues[]` (`--output human` prints `FAIL <item_type>/<id>` lines above the `Totals` line).
3. Read: `llmanspec/specs/**` (`<capability>.feature`, the single source of truth) on the branch, `proposal.md` and `design.md` (if present), `tasks.md`; ignore residual old docs under `changes/<id>/specs/`.
4. **Dual-axis review (kept separate so neither masks the other)** — diff against `git diff <merge-base>...HEAD` (merge-base is COMPUTED via `git merge-base <local-default> HEAD`; the stored base_sha is audit-only and MUST NOT feed range math):
   - **Spec axis**: does the implementation satisfy the `@human` rule MUST/SHALL and the `@executable` GWT? Missing/partial behaviors, wrong implementations, and scope creep not asked for by the spec → suggest minimal fixes or artifact updates. Check where before/after evidence (counts, baselines) was taken: it MUST be measured on the change branch (against the freshly computed merge-base); a value measured on the default branch is usually trivially the baseline and proves nothing.
   - **Standards axis**: does the code follow `AGENTS.md` + the smell baseline? Authority priority: `AGENTS.md` > smell baseline; skip anything tooling already enforces. Smells are **judgement heuristics** ("possible Feature Envy"), not hard violations:

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
5. **BDD verification** — only when `config.yaml` has a `bdd:` block:
   - Confirm the change is branch-bound and you are on that branch.
   - `llman-sdd validate --specs`: Gherkin + `@req`/dual-write gates; when `bdd.run_command` is configured the harness runs by default (`--no-check` skips it) and a failure maps to an ERROR on the matching spec item.
   - Optional read-only review: `llman-sdd change diff <id>` (or `--export-patch <path>`) — review/export only, never an apply step.
   - Next step after verify passes: `llman-sdd-archive` (not inline finalize here).
{% if bdd_verify_prompt %}
   - Extra requirement: {{ bdd_verify_prompt }}
{% endif %}
6. Produce a short report: **CRITICAL** (must fix before archive) / **WARNING** (should fix) / **SUGGESTION** (nice to have).
7. **Human review gate**: once the report has no CRITICAL findings and before suggesting archive, run `llman-sdd review`: exit code zero → suggest `llman-sdd-archive`; non-zero = CRITICAL → fix via `llman-sdd-apply`, then re-run review; MUST NOT enter finalize/archive with CRITICAL findings open.

{{ unit("skills/git-native-flow-brief") }}
{{ unit("skills/human-readable-summary") }}
{{ unit("skills/cli-footer") }}

{{ unit("skills/validation-hints") }}

{{ unit("skills/structured-protocol") }}
