## Archive 冷备引导
- archive 目录过大时用冷备维护（冻结 = 正文入 7z 冷备 + 以 `<YYYY-MM-DD>-<id>.yaml` 平铺卡替代目录，frontmatter 与依赖链保留可追溯）：
  - 预览冻结候选：`llman-sdd archive freeze --dry-run`
  - 冻结旧归档：`llman-sdd archive freeze --before <YYYY-MM-DD> --keep-recent <N>`
  - 列出已冻结条目：`llman-sdd archive freeze --list`
  - 需要恢复时：`llman-sdd archive thaw --change <YYYY-MM-DD-id>`（正文解回目录并移除平铺卡）
- freeze/thaw 仅用于日期归档目录（`YYYY-MM-DD-*`）；建议保留少量最近目录不冻结。
- 冻结卡的 frontmatter 与正文文件清单（含 sha256）常驻磁盘——元数据可 grep/可追溯，依赖校验与 graph 对冻结条目仍可见。
- 在非主检出（不持有默认分支的 worktree）运行时打印警告（仅提示、不阻断）——有意为之才在该处继续。
