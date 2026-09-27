## Canonical Single-Track Feature Contract

Each capability is ONE Gherkin file: flat `llmanspec/specs/<capability>.feature` (default) or directory `llmanspec/specs/<capability>/` with a same-named main file — pick one layout; both at once is a conflict. It is the only spec artifact (there is no `spec.toon`).

```gherkin
# language: zh-CN
# capability: sample
# purpose: One-line overview.
# scope: src/

功能: sample

  @req:r1 @executable
  场景: happy
    假如 a precondition
    当 a trigger happens
    那么 the outcome is observed

  @req:r2 @rule
  场景: Rule title
    System MUST do something (not yet converted to steps).

  @req:r3 @rule @human
  场景: Governance constraint
    A reviewer MUST adjudicate the reasonableness of this abstract goal.
```

- Header comments (`# capability:` / `# purpose:` / `# scope:`) are REQUIRED; `scope` drives staleness checks.
- **Prefer `@executable`**: express behavior as `Given/When/Then` steps bound to BDD step code and executed by the runner — the default preferred shape; minimize `@rule` definitions.
- `@rule` scenarios carry requirements that cannot be expressed programmatically (abstract goals, architecture decisions, governance) or are not yet converted: the statement lives verbatim in the description; an automatable anchor MUST link an `@executable` acceptance. `@rule @human` is a pure human constraint (statement MUST contain MUST/SHALL). `@rule` and `@executable` are mutually exclusive on one scenario.
- Editing/removing an existing `@rule`/`@human` rule scenario yields a WARNING only (report-only, never blocks a gate) — compare via git branch diff; the legacy lock-ack metadata `rules_touched` / `agent_acked` / `@agent` is removed with no aliases and no compat layer.
- `@executable` scenarios are runner-bound acceptance; they link rules via `@req:<req_id>`.
- Coverage tiers: enforced (has acceptance) / pending — `list --specs` reports both.
- Scenarios MUST stay top-level: `Rule:` blocks are rejected (the runner skips them silently).
