---
name: "llman-sdd-graph"
description: "Visualize change dependencies (depends_on/blocks) as a mermaid graph. Auxiliary tool, usable at any stage."
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Dependency Graph

Visualize dependencies between changes. Auxiliary tool, not part of the main pipeline (propose → apply → verify → archive); usable at any stage.

## Usage

**Focus view (seed mode)** — a specific change and its neighborhood:

```bash
llman-sdd graph <change-id>              # the change + direct relationships (depth 1)
llman-sdd graph <change-id> --depth 3    # recurse 3 levels
llman-sdd graph <change-id> --depth 0    # just the change itself
```

Traverses three directions: upstream (depends_on), downstream (depended by), and blocks; auto-discovers active and archived changes.

**Global view (scope mode)** — scope nodes are roots expanded one level along `depends_on` (depth 1, default; avoids unbounded dependency chains); `--depth` constrains this mode too:

```bash
llman-sdd graph                          # active changes + direct deps (depth 1 default)
llman-sdd graph --scope archived         # archived + direct deps
llman-sdd graph --scope all              # everything + direct deps
llman-sdd graph --depth 0                # scope nodes only (no dependency targets)
llman-sdd graph --depth 3                # recurse 3 levels along dependency chains
```

## Output

- Mermaid flowchart to stdout, pipeable to a file or renderer:
  ```
  llman-sdd graph c50 > deps.mmd
  llman-sdd graph c50 --depth 2 | mmdc -i - -o deps.png
  ```
- Archived changes show a "✓ done" suffix and green highlight; disconnected groups render as independent subgraphs labeled "Active" / "Done" / "Mixed".

## Declaring dependencies (proposal frontmatter)

```yaml
---
depends_on:
  - other-change-id
blocks:
  - blocked-change-id
---
```

{{ unit("skills/cli-footer") }}

{{ unit("skills/ethics-governance") }}
