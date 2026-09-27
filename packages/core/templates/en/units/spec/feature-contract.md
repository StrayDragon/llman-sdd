## Canonical Single-Track Feature Contract (native Gherkin layout)

Each capability is ONE Gherkin file: flat `llmanspec/specs/<capability>.feature` (default) or directory `llmanspec/specs/<capability>/` with a same-named main file — pick one layout; both at once is a conflict. It is the only spec artifact (there is no `spec.toon`).

The format is the **native Gherkin hierarchy**: `功能:` → `规则:` (the requirement: title + free-form description + `@req:<id>` handle) → nested `场景:` (executable GWT examples). This is the only canonical style; legacy tags (`@executable`/`@rule`/`@human`/`@manual`) are gone — migrate old files with `spec migrate-native`.

```gherkin
# language: zh-CN
# capability: sample
# purpose: One-line overview.
# scope: src/

功能: sample

  @req:r1
  规则: A requirement point
    Free-text requirement (no MUST/SHALL enforcement); wrap long text across
    lines for human/agent readability. A description line must not begin with
    a step keyword (would be parsed as a step).

    场景: An executable example
      假如 a precondition
      当 a trigger happens
      那么 the outcome is observed

  @req:r2
  规则: Not-yet-converted requirement (bare rule — counted by the aggregate nudges)
    This description is the only carrier of the requirement today. Rules with
    no nested scenario are counted as bare; specs-compact keeps driving them
    down or converting them.
```

- Header comments (`# capability:` / `# purpose:` / `# scope:`) are REQUIRED; `scope` drives staleness checks.
- **Executable scenarios preferred**: express behavior as nested `场景:` (`Given/When/Then`) bound to BDD step code and executed by the runner — the default. Only use a `规则:` block without executable scenarios for requirements that cannot be expressed programmatically (abstract goals, architecture decisions, governance/human judgment) or are not yet converted; record the rationale in proposal/design.
- `@req:<id>` lives on the `规则:` block header: the global unique requirement handle (shared by resolve-req/next-req-id/citation). Missing or duplicate ids are validate ERRORs.
- Rule description is free text: no MUST/SHALL enforcement; wrap long text across lines for reviewability, with no `- ` list marker (it would enter the description verbatim).
- Top-level `场景:` outside any `规则:` are orphans (validate WARNING); rules with no nested scenario are bare rules (aggregate INFO via `--include-info`; the review `pending` signal measures them).
- Editing/removing an existing `规则:` block yields a WARNING only (report-only, never blocks a gate) — compare via git branch diff; the legacy lock-ack metadata `rules_touched` / `agent_acked` / `@agent` is removed with no aliases and no compat layer.
- Coverage tiers: enforced (has nested scenarios) / pending (bare) — `list --specs` reports both.
- `规则:` blocks are containers: nested `场景:` are executed by the runner; two-space indent tiers (`规则:` 2, nested `场景:` 4, steps 6).
