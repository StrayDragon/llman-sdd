Validation fixes (single-track feature-as-spec):

1) Missing header comments (`missing # capability: header comment`): every capability `.feature` (`llmanspec/specs/<capability>.feature` or the same-named main file in a directory) MUST start with:
```
# language: zh-CN
# capability: <capability>
# purpose: One-line overview.
# scope: src/
```

2) Native layout (`rule must carry an @req:<req_id> tag on the rule header` / `orphan scenario`):
- One canonical style: `@req:<id>` on the `规则:` block header, nested `场景:` (Given/When/Then) as executable examples — the default preferred shape.
- Only keep a `规则:` block with no nested scenario (bare rule) for requirements that cannot be expressed programmatically or are not yet converted: free-text description, no MUST/SHALL enforcement; validate reports an aggregate count, the review `pending` signal measures it, specs-compact keeps reducing it.
- Legacy tags `@executable`/`@rule`/`@human`/`@manual` are gone and parse inert; when old files hit structural problems run `llman-sdd spec migrate-native`.
- Top-level `场景:` outside any `规则:` are orphan scenarios (WARNING).

Branch guardrail:
- First `change start` / `attach` to bind the branch, then edit `.feature` on the bound non-default branch and commit (land specs).
- Locked rules (report-only): editing/removing an existing `规则:` block yields a WARNING and never blocks validate / finalize / `change diff`; the report names the rule by `@req:<id>`. Control points: git branch diff plus `llman-sdd review` / `change diff`. Legacy lock-ack metadata (frontmatter `rules_touched` / `agent_acked`, the `@agent` tag, the `--yes` ack semantics) is fully removed — no aliases, no compat layer.
- Enter apply when `stage=full` and the specs-landed gate passes (specsLanded ∨ `needs_specs_change: false`); verify/finalize require `readyToImplement=true` (completion signal). Close-out prefers `change finalize`.
