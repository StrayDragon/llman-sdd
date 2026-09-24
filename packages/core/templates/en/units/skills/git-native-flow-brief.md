## Branch lifecycle (brief)

**Skill navigation** ≠ **branch lifecycle**. Full diagram: root `AGENTS.md` or the one inside `llman-sdd-propose`.

Hard rules:
1. **First** bind the branch (`change start` / `attach`) → full; **then** land specs (edit and commit `llmanspec/specs/**` on the bound branch).
2. No contract edits → `needs_specs_change: false`. Enter apply when `stage=full` and the specs-landed gate passes; `readyToImplement=true` (all gates green) is the completion signal gating verify/finalize.
3. Close-out: `change finalize` (auto commit `archive(sdd): <id>`; `--no-commit` to skip).
4. **Do not** commit specs on the default branch; if already attached, do not re-run `start`.
5. Worktree (optional): `change start --worktree` creates the branch in a dedicated worktree without hijacking the current checkout (`--base <branch>` records a non-default fork source); finalize runs in place when the target is held by another worktree (location annotated in output).
