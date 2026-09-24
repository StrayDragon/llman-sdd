---
name: "llman-sdd-ff"
description: "Fast-forward the propose path in one pass: planning docs → bind branch → land specs."
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Fast-Forward (FF)

Run the propose-equivalent path quickly: planning docs → bind branch → land specs (through the specs-landed gate). This is **not** the old `changes/<id>/specs/` delta model.

## Hard constraints

- Planning docs only under `llmanspec/changes/<id>/` (proposal/design/tasks); specs only under bound-branch `llmanspec/specs/**`.
- **Do not** create `llmanspec/changes/<id>/specs/`.
- Enter apply when `stage=full` and the specs-landed gate passes (or `needs_specs_change: false`); verify/finalize require `readyToImplement=true`.

## Steps

1. Take a one-line description; derive the change id when not supplied and announce it (non-blocking, same rule as propose); identify the impacted capability.
2. Ensure `llman-sdd init` has been run (`llmanspec/` exists).
3. If `llmanspec/changes/<id>/` exists: ask fill-missing vs new id; do not overwrite without confirmation.
4. Create the planning docs (OK briefly on the default branch): `llman-sdd change new <id>` (or hand-write) → flesh out `proposal.md` → `design.md` (if needed) → `tasks.md`.
5. **Bind the branch**: `llman-sdd change start <id>` (clean tree on the default branch) or create a branch then `change attach <id>`.
6. **Land specs**: on the bound branch, edit `llmanspec/specs/<capability>.feature` (flat, or directory main file) and commit; or set `needs_specs_change: false` when there is no contract edit.
7. Validate: `llman-sdd validate <id> --strict`.
8. Confirm the specs-landed gate is green via `llman-sdd show <id> --output json` (`specsLanded` / `needsSpecsChange`), then suggest `llman-sdd-apply` (do not suggest apply before landing).

{{ unit("skills/git-native-flow-brief") }}
{{ unit("skills/cli-footer") }}
{{ unit("skills/validation-hints") }}

{{ unit("skills/ethics-governance") }}
