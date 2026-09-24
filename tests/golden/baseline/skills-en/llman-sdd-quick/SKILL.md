---
name: "llman-sdd-quick"
description: "Quick path for small changes that don't touch behavioral contracts (refactor/typo/perf). If a MUST/SHALL change emerges, stop and switch to propose."
metadata:
  version: "0.1.0"
---

# LLMAN SDD Quick Path

Use this path for small changes that don't modify behavioral contracts.

## Pipeline Position

```mermaid
flowchart LR
    quick["★ llman-sdd-quick"] --> commit["git commit"]
    explore["llman-sdd-explore"] --> propose["Full path: propose → apply → verify → archive"]

    style quick fill:#d4edda,stroke:#28a745,stroke-width:3px
```

> 📍 Quick path: edit code and commit directly. If you find a contract change is needed → STOP, switch to `llman-sdd-propose`.

## Conditions (all must hold)
- Does not change any MUST/SHALL-defined externally observable behavior
- Does not cross capability boundaries; no migration/compatibility concerns; not an SDD meta-spec change

## Steps
1. Use `llman-sdd context --task "..." --paths "..."` to confirm no spec changes are needed.
   - If context returns `quality: "unavailable"` → run `llman-sdd index check` first: stale/missing → `llman-sdd index rebuild` (default `pageindex`, no model needed) and retry; still unavailable on a fresh index (`LLMAN_SDD_INDEX_CHAT_MODEL` unset) → fall back to `llman-sdd list --specs` + reading `.feature` files directly — do not loop on rebuild.
2. Modify the code directly.
3. If you need to touch `llmanspec/specs/**`, STOP — unless you are on a bound non-default change branch (mini change: `change start`/`attach` → edit → commit). Never commit specs on the default branch, not even for typo or scope-only fixes. Prefer routing specs maintenance to `llman-sdd-propose`.
4. git commit (message explains why). No change directory, no archive.

## Boundary handling
- A behavioral contract change emerges mid-edit → STOP, switch to `llman-sdd-propose`.
- Multiple files involved and scope unclear → confirm with `llman-sdd context` first.

> For command details run `llman-sdd <cmd> --help`; the CLI is the command reference — skills embed no command tables.
> "Spec" here = a `.feature` file under this project's `llmanspec/specs/`; run `llman-sdd list --specs` or `llman-sdd show <capability>`.

## Ethics Governance
- `ethics.risk_level`: low — reads/writes this repo and `llmanspec/` only, no outward-facing actions; a skill body may override.
- `ethics.prohibited_actions`: actions violating the skill body's hard rules; push / PR / external upload without an explicit user request.
- `ethics.required_evidence`: conclusions backed by command output or file paths; gate state per `llman-sdd validate`.
- `ethics.refusal_contract`: gate CRITICAL not cleared → refuse to advance; self-repair cap reached → report a blocker.
- `ethics.escalation_policy`: pause and ask the user before changing SDD contracts/templates or irreversible actions.
