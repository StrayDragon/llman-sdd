# Design: worktree 感知的 change 生命周期

## D1 start --worktree 的 fork 源判定
优先序:--base 显式 > 当前分支(如实记录,可为非默认分支)> 默认分支解析。经典路径(无旗标)维持 r14 原门(必须当前在默认分支),保证 v1 parity 不动;--base 或 --worktree 给定时豁免默认分支门(干净树门保持)——豁免本身是新合约语义,由 r68 钉定。

## D2 worktree 路径与命名
- worktree_root 缺省 = 仓库根的父目录(与 wt 惯例一致的兄弟目录布局);配置绝对/相对路径均可(相对仓库根解析)。
- 目录名:naming=id → `<repo-basename>-<branch 的 '/' 换 '-')`;naming=hash → `<repo-basename>-<base32(sha256(change_id))[:8]>`。
- 已存在路径 → 报错(--clobber 不做,防误删);分支已存在 → 报错。
- worktree 创建用 `git worktree add <path> <branch>`(分支先建后挂,或 `git worktree add -b` 一步)。

## D3 finalize/archive 的持有执行
- 检测:`git worktree list --porcelain` 解析 branch→path 映射;目标分支的持有 worktree 非当前 → 视为"持有执行"场景。
- 持有且干净:全部写操作(merge --squash / ff、改名、archive 提交)以该 worktree 为 cwd 执行(io 根切换到该路径);输出加一行「executed in target worktree <path>」。完成后当前(change)worktree 的 changes/<id> 已随提交进入目标分支——当前 worktree 残留旧目录内容属预期,提示 `wt remove`/`git worktree remove` 清理。
- 持有且脏:报错含路径与两条处置建议(清理该 worktree 或手动合并命令),零写入。
- 当前 worktree 自己持有目标 → 现行路径不变。

## D4 测试 seam
tests/bdd/steps/lifecycle.ts 既有 TempRepo 工厂扩展:`git worktree add` 构造双 worktree fixture;r68/r69 场景全部 CLI 子进程断言(退出码/stdout/frontmatter 文件内容)。
