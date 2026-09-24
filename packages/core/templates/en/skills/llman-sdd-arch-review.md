---
name: "llman-sdd-arch-review"
description: "Architecture review: scan for shallow modules (interface ≈ implementation) and surface deepening candidates to improve testability and AI-navigability."
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Architecture Review

Scan the codebase for architectural friction and surface **deepening opportunities** — turning shallow modules (interface ≈ implementation) into deep ones (lots of behavior behind a small interface). The aim is testability and AI-navigability. Auxiliary tool, not part of the main pipeline; usable at any stage, commonly triggered during explore.

## Design vocabulary

Words about module shape; MUST NOT substitute "component" / "service" / "API" / "boundary" (broader, less precise):

- **Module** — anything with an interface and an implementation (function/class/package/cross-layer slice).
- **Interface** — everything a caller must know to use it correctly: type signature, plus invariants, ordering constraints, error modes, performance characteristics.
- **Depth** — the amount of behavior behind the interface. **Deep** = lots of behavior behind a small interface; **shallow** = interface nearly as complex as the implementation (the caller saves nothing). This skill turns shallow into deep.
- **Seam** — a place where you can swap the implementation without editing call sites (where the interface lives). In llman, seam = the public boundary driven by `*.feature` GWT steps.
- **Leverage** — what callers get from depth: more capability per unit of interface learned.
- **Locality** — what maintainers get from depth: changes/bugs/knowledge/verification concentrate in one place.

## Steps

### 1. Explore (scope first, YAGNI)
- If the user named a direction (module/subsystem/pain point), accept it; skip inference.
- Otherwise walk `git log --oneline` for hot spots (files/areas that keep coming up).
- Prefer reading `<capability>.feature` (the single source of truth) and `design.md` (existing ADRs); MUST NOT create a `CONTEXT.md`.
- Use the Agent tool (`subagent_type=Explore`) to walk the codebase, noting friction:
  - Does understanding one concept require bouncing between many small modules?
  - Where are modules **shallow** (interface ≈ implementation complexity, callers save nothing)?
  - Where are pure functions extracted only for testability, but real bugs hide in how they're called (no locality)?
  - Which parts are untested or hard to test through their current interface?

### 2. Present candidates
For each candidate:
- **Files** — which files/modules are involved.
- **Problem** — why the current architecture causes friction (use depth/leverage/locality).
- **Solution** — plain-English description of what would change.
- **Benefits** — locality and leverage improvements; how tests get better.
- **Recommendation strength** — `Strong` / `Worth exploring` / `Speculative`.

**Deletion test**: for any suspected-shallow module, imagine deleting it — does complexity vanish (it's just a pass-through) or reappear across N call sites (it's actually earning its keep)? "Reappears" is the signal you want.

**ADR conflicts**: if a candidate contradicts an existing `design.md` decision, surface it only when the friction is real enough to warrant reopening, and mark it in the candidate.

### 3. Deep-dive Q&A (after the user picks a candidate)
Run `llman-sdd-explore`'s **deep-dive Q&A branch** (trigger "deep-dig") to walk the decision tree — constraints, dependencies, the deepened module's shape, what sits behind the seam, which tests survive.

- The deepened module uses a concept not in the `.feature`? → update the `.feature` **only** if the change is branch-bound and you are on the bound branch; otherwise STOP and route to `llman-sdd-propose` / `change start` — **never** edit specs on the default branch.
- User rejects the candidate with a load-bearing reason? → offer an ADR only when "hard to reverse + surprising without context + real trade-off" all hold; record in `design.md`.

## Output
Candidate list (text; optional HTML report written to the OS temp dir, not the repo) + the deep-dive decision record after the user picks one (write back to the proposal; contract edits only after landing on the bound branch into the `.feature`).

{{ unit("skills/cli-footer") }}

{{ unit("skills/structured-protocol") }}
