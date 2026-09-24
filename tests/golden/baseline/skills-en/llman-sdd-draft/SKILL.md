---
name: "llman-sdd-draft"
description: "Capture a change idea as a draft (proposal.md only, no id asked). For jotting ideas/future needs; formalize with propose when ready."
metadata:
  version: "0.1.0"
---

# LLMAN SDD Draft

Capture a change idea as a **draft** (a `proposal.md` skeleton only) — the lightweight "just record it" entry: no scale assessment, no tasks, no specs edits, no attach. Formalize with `llman-sdd-propose` when ready to act.

## Pipeline Position

```mermaid
flowchart LR
    draft["★ llman-sdd-draft"] -.->|"formalize"| propose["llman-sdd-propose"]
    propose --> apply["llman-sdd-apply"] --> verify["llman-sdd-verify"] --> archive["llman-sdd-archive"]

    style draft fill:#fff3cd,stroke:#ffc107,stroke-width:3px
```

> 📍 Draft stage → next: flesh out `proposal.md`, then `llman-sdd-propose` to formalize.

## Hard Constraints

- **MUST NOT ask the user for a change id**: derive it from the description via `change new --from` and announce it.
- **MUST NOT create tasks/design/specs/attach**: only the `proposal.md` draft; full planning belongs to `llman-sdd-propose`.
- **MUST NOT assess change scale**: that is propose's job. If the user wants to start implementing → suggest `llman-sdd-propose`.
- **Scope boundary**: if the description clearly involves MUST/SHALL contract changes or multi-file impact, suggest `llman-sdd-propose` — but still create the draft first so the idea isn't lost.
- **Frontmatter has a fixed schema**: `proposal.md` accepts only the allowed fields in `llmanspec/AGENTS.md` "Change Proposal Frontmatter SSOT" (`depends_on`, `blocks`, `branch`, `base_sha`, `needs_specs_change`, etc.); `status`/`title`/`priority`/`author` are rejected by `llman-sdd validate` as ERROR. Lifecycle stage is inferred (query via `llman-sdd show`/`list`), never stored in frontmatter. Do not re-declare frontmatter fields in the prose body (no `## Status` block); the H1 is a human-readable title, not a repeat of the change id.

## Steps

### 0) Preflight
- Read `llmanspec/config.yaml`; if `llmanspec/` is missing, tell the user to run `llman-sdd init`, then STOP.

### 1) Capture the description
- Take the user's description as-is (e.g. "draft: add an export-to-json command", "note: sdd changes should support worktrees"). **MUST NOT ask for a change id.**

### 2) Create the draft
```bash
llman-sdd change new --from "<user description>"
```
- The CLI generates a legal kebab-case id, creates `llmanspec/changes/<id>/proposal.md` (a skeleton with `## Why` / `## What Changes` TODO sections), and prints the id + path.
- On id collision the CLI fails non-zero; suggest rephrasing or `--force` to overwrite (rare for drafts).

### 3) Announce and hand off
- **MUST tell the user the derived id** ("Created draft change `<id>` at `llmanspec/changes/<id>/proposal.md`").
- Suggest next steps: flesh out `proposal.md` (Why / What Changes / Capabilities / Impact); formalize with `llman-sdd-propose` when ready.

> For command details run `llman-sdd <cmd> --help`; the CLI is the command reference — skills embed no command tables.
> "Spec" here = a `.feature` file under this project's `llmanspec/specs/`; run `llman-sdd list --specs` or `llman-sdd show <capability>`.

## Ethics Governance
- `ethics.risk_level`: low — reads/writes this repo and `llmanspec/` only, no outward-facing actions; a skill body may override.
- `ethics.prohibited_actions`: actions violating the skill body's hard rules; push / PR / external upload without an explicit user request.
- `ethics.required_evidence`: conclusions backed by command output or file paths; gate state per `llman-sdd validate`.
- `ethics.refusal_contract`: gate CRITICAL not cleared → refuse to advance; self-repair cap reached → report a blocker.
- `ethics.escalation_policy`: pause and ask the user before changing SDD contracts/templates or irreversible actions.
