---
name: "llman-sdd-specs-compact"
description: "Compact and dedupe specs: merge redundant requirements/scenarios without changing normative behavior. Manual run only, when the user explicitly asks."
metadata:
  version: "{{ llman_version }}"
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

{{ unit("skills/cli-footer") }}

{{ unit("skills/validation-hints") }}

{{ unit("skills/ethics-governance") }}
