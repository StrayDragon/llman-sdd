## Archive 冷备引导
- archive 目录过大时用冷备维护（冻结 = 正文入 7z 冷备 + 以 `<YYYY-MM-DD>-<id>.yaml` 平铺索引卡替代目录，卡仅含 title 与 depends_on）：
  - 预览冻结候选：`llman-sdd archive freeze --dry-run`
  - 冻结旧归档：`llman-sdd archive freeze --before <YYYY-MM-DD> --keep-recent <N>`
  - 列出已冻结条目：`llman-sdd archive freeze --list`
  - 需要恢复时：`llman-sdd archive thaw --change <YYYY-MM-DD-id>`（正文解回目录并移除平铺卡）
- freeze/thaw 仅用于日期归档目录（`YYYY-MM-DD-*`）；建议保留少量最近目录不冻结。
- 平铺索引卡常驻磁盘：title（来自 proposal H1）与 depends_on（graph 依赖边种子）可 grep、可追溯；
  id 与日期由文件名隐含——冻结 change 的用途与依赖关系无需解冻即可查阅，正文在 7z 冷备按需取用。
- 在非主检出（不持有默认分支的 worktree）运行时打印警告（仅提示、不阻断）——有意为之才在该处继续。
