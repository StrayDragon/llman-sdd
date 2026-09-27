Validation fixes (single-track feature-as-spec):

1) Missing header comments (`missing # capability: header comment`): every capability `.feature` (`llmanspec/specs/<capability>.feature` or the same-named main file in a directory) MUST start with:
```
# language: zh-CN
# capability: <capability>
# purpose: One-line overview.
# scope: src/
```

2) Tag grammar (`rule scenario must carry an @req:<req_id> tag` / `@rule and @executable are mutually exclusive` / `orphan acceptance scenario`):
- Rules: `@req:<id> @rule` — statement verbatim in the scenario description; pure human constraints use `@req:<id> @rule @human` (MUST/SHALL required).
- Acceptance/executable: `@executable` + at least one `@req:<id>` linking a rule — the default preferred shape; steps are bound to BDD code.
- Pairing triage (**prefer executable, minimize @rule definitions**): any GWT-expressible automatable behavior bound to step code MUST land as an `@executable` and link back to the rule (prose-only rules guard nothing); abstract goals/architecture decisions — non-automatable human judgment — use `@rule @human` and record the justification in proposal/design when no pairing is possible; not-yet-converted requirements use a `@rule` anchor that MUST link an `@executable` acceptance.
- Never combine `@rule` with `@executable`; never combine `@human` with `@executable`; `@manual` was removed in 0.3.0 — leftovers report a migration ERROR, just drop the tag.

Branch guardrail:
- First `change start` / `attach` to bind the branch, then edit `.feature` on the bound non-default branch and commit (land specs).
- Locked rules (report-only): editing/removing an existing `@rule`/`@human` rule scenario yields a WARNING and never blocks validate / finalize / `change diff`; the report names the rule by `@req:<id>`. Control points: git branch diff plus `llman-sdd review` / `change diff`. Legacy lock-ack metadata (frontmatter `rules_touched` / `agent_acked`, the `@agent` tag, the `--yes` ack semantics) is fully removed — no aliases, no compat layer.
- Enter apply when `stage=full` and the specs-landed gate passes (specsLanded ∨ `needs_specs_change: false`); verify/finalize require `readyToImplement=true` (completion signal). Close-out prefers `change finalize`.
