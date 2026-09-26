## Archive Cold Backup Guidance
- When archived directories grow too large, use cold backup maintenance (freeze moves bodies into the 7z cold backup and replaces the dir with a flat `<YYYY-MM-DD>-<id>.yaml` card — frontmatter and dependency chains stay traceable on disk):
  - Preview freeze candidates: `llman-sdd archive freeze --dry-run`
  - Freeze old archives: `llman-sdd archive freeze --before <YYYY-MM-DD> --keep-recent <N>`
  - List frozen entries: `llman-sdd archive freeze --list`
  - Restore when needed: `llman-sdd archive thaw --change <YYYY-MM-DD-id>` (extracts bodies back and removes the card)
- Apply freeze/thaw only to dated archive directories (`YYYY-MM-DD-*`); keep a small recent window unfrozen.
- The frozen card keeps the frontmatter and the body file manifest (with sha256) on disk — metadata stays grep-able and traceable; dependency validation and graph keep frozen entries visible.
- Running outside the main checkout (a worktree not holding the default branch) prints a warning (never blocks) — continue there only intentionally.
