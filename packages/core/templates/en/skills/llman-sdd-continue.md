---
name: "llman-sdd-continue"
description: "Continue an existing change: create the next missing artifact."
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Continue

Continue an existing change and create the next missing artifact.

## Steps
1. Identify the change id: use it if provided; otherwise run `llman-sdd list --json` and ask which change to continue. Always announce "Using change: <id>".
2. Read `llmanspec/changes/<id>/`.
> Stage decisions use `stage` / `readyToImplement` from `llman-sdd show <id> --output json --type change`; the full decision table lives in llman-sdd-apply.
3. Determine the next missing artifact, in order:
   1) `proposal.md`
   2) `design.md` (only when design tradeoffs matter)
   3) `tasks.md`
   4) `llman-sdd change start <id>` (or `change attach <id>` if the branch exists) — bind the branch
   5) Edit `llmanspec/specs/<capability>.feature` (flat, or directory main file) on the **bound branch** and commit — land specs (or set `needs_specs_change: false` when there is no contract edit)
4. Create exactly ONE missing artifact (or one spec edit on the bound branch).
   - Do NOT write application code; do NOT create `changes/<id>/specs/`; do NOT edit `llmanspec/specs/**` before start/attach.
5. If all artifacts exist, suggest next steps from `llman-sdd show <id> --output json`:
   - specs-landed gate failing → land specs first (or `needs_specs_change: false`); do **not** suggest apply yet
   - specs-landed gate green (even mid-implementation with `readyToImplement=false` while tasks remain) → `llman-sdd-apply`
   - After verify → `llman-sdd-archive`
   - Validate: `llman-sdd validate <id> --strict`; review: `llman-sdd change diff <id>` (read-only)

{{ unit("skills/git-native-flow") }}
{{ unit("skills/cli-footer") }}
{{ unit("skills/validation-hints") }}

{{ unit("skills/structured-protocol") }}
