## Archive Cold Backup Guidance
- When archived directories grow too large, use cold backup maintenance (freeze moves bodies into the 7z cold backup and replaces the dir with a flat `<YYYY-MM-DD>-<id>.yaml` index card carrying only `title` and `depends_on`):
  - Preview freeze candidates: `llman-sdd archive freeze --dry-run`
  - Freeze old archives: `llman-sdd archive freeze --before <YYYY-MM-DD> --keep-recent <N>`
  - List frozen entries: `llman-sdd archive freeze --list`
  - Restore when needed: `llman-sdd archive thaw --change <YYYY-MM-DD-id>` (extracts bodies back and removes the card)
- Apply freeze/thaw only to dated archive directories (`YYYY-MM-DD-*`); keep a small recent window unfrozen.
- The flat index card stays on disk: `title` (from the proposal H1) and `depends_on` (seed for graph dependency edges) are grep-able and traceable; the id and date are implied by the file name — the purpose and dependencies of a frozen change are inspectable without thawing, while bodies live in the 7z cold backup and are fetched on demand.
- Running outside the main checkout (a worktree not holding the default branch) prints a warning (never blocks) — continue there only intentionally.
