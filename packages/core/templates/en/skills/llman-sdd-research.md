---
name: "llman-sdd-research"
description: "Delegate fact-finding to a background agent: primary sources only (official docs/API/source), cited findings."
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Research

Spin up a **background agent** to do the research while you keep working. Auxiliary tool, usable at any stage (common in explore/wayfinder); output is written back to the change's proposal "Further Notes" section.

## The background agent's job

1. Investigate against **primary sources** — official docs, source code, specs, first-party APIs, not secondary write-ups; trace every claim back to the source that owns it.
2. Write findings to a single Markdown file, citing each claim's source.
3. Save location (repo convention wins if it has one): **default** `llmanspec/changes/<current-change>/research/<topic>.md` (change docs, **not** specs). Write to `docs/research/` only when the topic spans multiple changes and will still be referenced after archiving; **never** put single-change decisions or decaying deep-dives into `docs/research/`.
4. **MUST NOT** edit `llmanspec/specs/**` in this skill. If research shows MUST/SHALL must change → suggest `llman-sdd-propose` (bind branch → land specs).

## Steps

1. Clarify the research question (confirm with the user; sharpen a fuzzy one into a falsifiable one).
2. Launch via the Agent tool with `subagent_type=general-purpose` + `run_in_background: true`, prompt containing:
   - The question statement; a requirement to cite only primary sources, with source URL/path per claim;
   - The output file path (default `llmanspec/changes/<id>/research/<topic>.md`);
   - A word limit (suggested: focus on facts, prose narrative < 1500 words).
3. Continue main-flow work while it runs; when done, read the output and summarize key conclusions into the current change's `proposal.md` "Further Notes" section (with a file pointer).
4. If the research reveals a decision is needed, suggest entering `llman-sdd-explore`'s deep-dive Q&A branch.

## Cooperation with wayfinder

`llman-sdd-wayfinder`'s research tickets delegate to this skill for background resolution; on completion, write back to the ticket proposal and record a one-line gist in the map's Decisions-so-far.

{{ unit("skills/cli-footer") }}

{{ unit("skills/structured-protocol") }}
