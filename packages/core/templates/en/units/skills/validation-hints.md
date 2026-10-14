Validation fixes (single-track feature-as-spec):

1) Missing `# purpose:` header: every capability `.feature` MUST carry a non-empty `# purpose:`; the Feature title MUST equal the assigned spec id (`llman-sdd list --specs` for ids).
```
# language: zh-CN
# purpose: One-line overview.

Feature: <spec-id>
```

2) Native layout (`rule must carry an @req:<req_id> tag on the rule header`):
- One canonical style: `@req:<id>` on the `规则:` block header, nested `场景:` (Given/When/Then) as executable examples — the default preferred shape.
- Only keep a `规则:` block with no nested scenario (bare rule) for requirements that cannot be expressed programmatically or are not yet converted: free-text description, no modal-verb enforcement; validate reports an aggregate count, the review `pending` signal measures it, specs-compact keeps reducing it.
- Legacy tags `@executable`/`@rule`/`@human`/`@manual` are gone and parse inert; when old files hit structural problems run `llman-sdd spec migrate-native`.
- Top-level `场景:` outside any `规则:` are plain feature-level examples: no rule handle, no warning, not part of rule accounting (native Gherkin).

Branch guardrails:
- Bind with `change start` / `attach` first, then edit `.feature` on the bound branch and commit (land specs).
- Locked rules (report-only): editing/deleting existing `规则:` blocks emits WARNING only — does not block validate / finalize / `change diff`; reports name the changed rule via `@req:<id>`. Control points: git branch diff + `llman-sdd review` / `change diff`. Legacy lock metadata (`rules_touched` / `agent_acked` / `@agent` tag / `--yes` confirm semantics) is fully removed — no aliases, no compatibility layer.
- `stage=full` with specs-landed gate green (`specsLanded` ∨ `needs_specs_change: false`) is enough to enter apply; verify/finalize requires `readyToImplement=true` (completion signal). Prefer `change finalize` for close-out.
