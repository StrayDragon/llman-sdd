# Design: worktree 加固(next-id 跨 worktree 扫描 + freeze 主检出警告)

## D1 next-id 多 worktree 扫描(r35 扩展)

- 复用 `spawnGit.worktreeList`(`worktree list --porcelain`)取全部 worktree 路径,尾斜杠归一后去重;每棵树以 `<worktree>/llmanspec` 为根复用既有全树遍历(nextId.ts 内抽出的 `collectNumbers`),全程只读。
- 退化:worktree list 失败(非 git 仓/git 命令失败)SHALL 仅扫当前树,并在 warnings 记录退化原因(best-effort,与归档扫描同级);human 两行输出形态不变(warnings 仍走 stderr)。
- 同编号提示:按「编号 → worktree 路径集合」归并,某编号出现于多于一个 worktree 时 warnings 追加一条(含编号与路径列表);`--json` 载荷形状保持 `{maxNumber, nextNumber, warnings}` 逐字节兼容。
- 模板渲染路径(`change_id.template` 的 `nextUniqueNumber`)不动——r35 口径仅约束 `change next-id` 命令。

## D2 freeze/thaw 主检出判定与警告(r24 扩展)

- 主检出 = 持有默认分支(`defaultBranch` 解析)的 worktree;探测 best-effort:defaultBranch 解析 / worktree list / rev-parse 任一失败 → 静默跳过警告,不影响命令。
- 判定:执行 worktree(`rev-parse --show-toplevel`,尾斜杠归一)≠ 主检出路径(含「无任何 worktree 持有默认分支」的退化态)→ 输出一行 WARNING 到 stdout(运行时输出英文,与 CLI 惯例一致),措辞覆盖三要素:非主检出 / 冷备可能不完整 / 建议回主检出;不改变退出码与产物形态。
- 探测与措辞构造放 core(`spawnGit.ts`:`probeMainCheckout` / `nonMainCheckoutWarning`,GitLike 注入保持纯),CLI `archive.ts` 仅接线,freeze/thaw 两命令复用同一实现。

## D3 测试 seam

- r35:tests/bdd/steps/lifecycle.ts 增补双 worktree fixture(`git worktree add` 兄弟目录):次 worktree 放未提交更高编号目录断言 next-id 吸收;共享编号 committed 断言 `--json` warnings 提示。
- r24:tests/bdd/steps/archive.ts 增补次级 worktree(持有非默认分支)freeze 场景(7z 守卫同 meta-foundation.ts);断言 WARNING 在 stdout 且冷备产物仍生成、候选目录被移除。
