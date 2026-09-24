---
name: "llman-sdd-wayfinder"
description: "Break huge, foggy work (beyond one agent session) into a decision map, resolving decisions one at a time. Manual trigger only."
metadata:
  version: "{{ llman_version }}"
disable-model-invocation: true
---

# LLMAN SDD Wayfinder

A loose, large idea has arrived — too big for a single agent session, and the way from here to the **destination** isn't visible yet. This skill finds that way rather than charging ahead: it charts the path as a change dependency graph (`llman-sdd graph`), where each sub-work item (ticket) resolves a **decision** rather than delivering code, worked one at a time until the way is clear.

## Pipeline position

Auxiliary tool for **pre-planning large work** before the main pipeline. When the map clears → `llman-sdd-propose` to collapse decisions into an implementable plan.

## Core principles

- **Plan, don't do**: each ticket resolves a decision; the map is done when "the way is clear, no decisions left". The urge to just do the work is usually the signal you've reached the map's edge and should hand off.
- **Refer by name**: in human-readable narration, refer to a ticket by its title; MUST NOT use bare ids/numbers.
- **One session, one ticket** (research tickets excepted).

## Map structure

The map is a change (overview proposal); its sub-decisions are `depends_on` child changes. Use `llman-sdd graph <map-id> --scope active` to visualize the **frontier** (takeable items).

The map's `proposal.md` structure:

```markdown
## Destination
<what reaching the end looks like — spec/decision/change. One or two lines.>

## Notes
<domain; skills each session should consult; standing preferences>

## Decisions so far
<!-- index: one line per closed ticket, gist + link -->

## Not yet specified
<!-- fog: foreseeable but not yet sharp enough to ticket; graduates as the frontier advances -->

## Out of scope
<!-- beyond the destination; closed tickets, never graduate -->
```

## Ticket types

Each ticket is a child change carrying a `wayfinder:<type>` tag (in the proposal title or frontmatter):

- **Research (agent-driven)**: read docs/APIs/local resources to surface a fact a decision waits on. Delegate to `llman-sdd-research` in the background.
- **Prototype (human-in-the-loop)**: raise fidelity with a cheap, rough runnable (throwaway terminal app or UI variant).
- **Deep-dive Q&A (human-in-the-loop)**: via `llman-sdd-explore`'s deep-dive branch, one question at a time. **Default type**.
- **Task (human or agent)**: manual work that must happen before a decision can be made (sign up for a service, move data so its shape is visible).

## Fog of war

The map is **deliberately** incomplete. The test for ticket-vs-fog: **can you state the question precisely now** (not whether you can answer it).
- Can state precisely → ticket (even if blocked).
- Cannot yet → **Not yet specified** (coarser than a ticket; one fog patch may graduate into several tickets or none).

## Steps

### Chart the map
1. **Name the destination**: use the deep-dive Q&A branch to pin down what this map is finding its way to.
2. **Breadth-first scan**: deep-dive again, fanning out rather than drilling one thread, surfacing open decisions and the first takeable steps. If **no fog surfaces** — the way is already clear, the whole effort fits one session — you don't need a map; stop and ask the user how to proceed.
3. **Create the map** (overview change): `llman-sdd change new <map-id>`, fill Destination/Notes, leave Decisions-so-far empty, write fog into Not yet specified.
4. **Create the tickets you can specify now** as child changes, then wire blocking edges with `llman-sdd graph` (ids needed before cross-referencing).
5. Spin up `llman-sdd-research` background subagents for each research ticket.
6. Stop — charting is one session's work; resolve nothing by hand.

### Work through the map
1. Load the map (low-resolution view; don't read every ticket in full).
2. Pick a ticket (user-named or first frontier item); claim it by binding the branch (`change start`, or `change attach` if the branch exists). Planning docs may briefly live on the default branch; if the ticket must edit specs, land them on the bound branch.
3. Resolve it — zoom as needed (read related ticket bodies, invoke the skills the Notes block names). In doubt, use the deep-dive Q&A. **Do not** edit `llmanspec/specs/**` before binding.
4. Record the resolution: write the answer into the ticket's proposal, close it, append a one-line gist + pointer to the map's Decisions-so-far.
5. Add newly-surfaced tickets (create-then-wire); graduate fog the answer made specifiable out of Not yet specified; if the answer reveals a ticket sits beyond the destination, rule it out of scope rather than resolving it on the route.

## Output
Map change + child decision changes' dependency graph (`llman-sdd graph`). When the way is clear, proceed to `llman-sdd-propose` to collapse decisions into an implementable plan.

{{ unit("skills/cli-footer") }}

{{ unit("skills/structured-protocol") }}
