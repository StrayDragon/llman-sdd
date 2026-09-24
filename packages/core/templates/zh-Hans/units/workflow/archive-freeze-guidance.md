## Archive 冷备引导
- archive 目录过大时用冷备维护：
  - 预览冻结候选：`llman-sdd archive freeze --dry-run`
  - 冻结旧归档：`llman-sdd archive freeze --before <YYYY-MM-DD> --keep-recent <N>`
  - 需要恢复时：`llman-sdd archive thaw --change <YYYY-MM-DD-id>`
- freeze/thaw 仅用于日期归档目录（`YYYY-MM-DD-*`）；建议保留少量最近目录不冻结。
- 在非主检出（不持有默认分支的 worktree）运行时打印警告（仅提示、不阻断）——有意为之才在该处继续。
