## Branch lifecycle (full diagram)

Two layers, don't conflate them: the **branch lifecycle** (bind branch → land specs → `readyToImplement`) vs **skill navigation** (explore→propose→apply→verify→archive). Landing specs is **not** a separate skill.

```mermaid
flowchart TB
  subgraph main_ok["OK briefly on default branch"]
    A["change new → draft<br/>proposal.md only"]
    B1["add design.md → designed"]
    B2["add tasks.md → planned"]
  end

  subgraph bind["Bind branch"]
    C{"Clean tree<br/>and on default branch?"}
    D["change start<br/>create sdd/&lt;id&gt; + write branch/base_branch/base_sha"]
    E["or manual checkout -b<br/>then change attach"]
  end

  subgraph specs_only["Only on this change branch"]
    F["Edit llmanspec/specs/** (.feature)"]
    G["commit → land specs<br/>live merge-base...HEAD includes specs paths"]
  end

  subgraph implement["Implement & close"]
    H["apply: code per tasks<br/>may keep editing specs"]
    I["verify"]
    J["finalize: merge (squash default) → rename → auto commit archive(sdd): &lt;id&gt;<br/>specs first hit the target branch"]
  end

  A --> B1 --> B2 --> C
  C -->|yes| D --> F
  C -->|already on feature| E --> F
  F --> G --> H --> I --> J
```

Hard rules:
1. **First** `change start` / `attach` to bind the branch (enter full); **then** edit `llmanspec/specs/**` on the bound non-default branch and commit (land specs).
2. No contract edits → set frontmatter `needs_specs_change: false`. Enter apply when `stage=full` and the specs-landed gate passes (specsLanded ∨ needs_specs_change=false); `readyToImplement=true` (every gateChecks item green, incl. tasks-done) is the completion signal gating verify/finalize. Diff ranges are always live merge-bases; the stored `base_sha` is audit-only.
3. Close-out is `llman-sdd change finalize <id>`: it auto-commits `archive(sdd): <id>` (impl diff + rename in one commit); `--no-commit` skips the auto commit. Commits on the change branch are free (segmented or finalize single-shot).
4. **Do not** commit specs to the default branch just to satisfy the clean-tree gate; if already attached, do not re-run `start`.

Worktree decision table:

| Working style | Command | Criteria |
|---|---|---|
| Single checkout | `llman-sdd change start <id>` | On the default branch with a clean tree; switches this checkout to the new branch |
| Keep current checkout / parallel changes | `llman-sdd change start <id> --worktree` | Branch lives in a dedicated worktree (`sdd.worktree_root` / `sdd.worktree_naming` config; default sibling of the repo root), current checkout untouched, output includes the worktree path; pair with `--base <branch>` for a non-default fork source |
| Already on a feature branch (incl. manual wt/git-worktree) | `llman-sdd change attach <id>` | Branch already exists; `--base <branch>` records the fork source explicitly |

finalize target location: when the target branch is held by another worktree, `llman-sdd change finalize <id>` / `llman-sdd change archive <id>` run the merge, rename and commit inside that worktree (output includes `executed in target worktree <path>`); a dirty holding worktree aborts with disposal options and zero writes.
