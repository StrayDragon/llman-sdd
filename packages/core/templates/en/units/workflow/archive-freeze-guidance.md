## Archive Cold Backup Guidance
- When archived directories grow too large, use cold backup maintenance:
  - Preview freeze candidates: `llman-sdd archive freeze --dry-run`
  - Freeze old archives: `llman-sdd archive freeze --before <YYYY-MM-DD> --keep-recent <N>`
  - Restore when needed: `llman-sdd archive thaw --change <YYYY-MM-DD-id>`
- Apply freeze/thaw only to dated archive directories (`YYYY-MM-DD-*`); keep a small recent window unfrozen.
- Running outside the main checkout (a worktree not holding the default branch) prints a warning (never blocks) — continue there only intentionally.
