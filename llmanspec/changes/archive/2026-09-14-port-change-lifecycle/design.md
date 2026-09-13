# Design

## 范围(本 change)

git 子进程封装 + frontmatter 绑定 + change 生命周期命令(`new/start/attach/next-id/diff/finalize`)。`freeze/thaw`、staleness、worktree 留给后续 change(范围裁决见 llmanspec/AGENTS.md:worktree 不移植)。

## git 层(packages/core/src/git/)

- 一律子进程(node:child_process spawnSync;双运行时合规)。`runGit(args, cwd)` 统一封装:非零退出抛 `GitError`(带 stderr)
- `defaultBranch(root)`:local-first 解析 main → master → origin/HEAD → origin/* 第一个存在者(r16 语义,v1 git_utils 行为)
- `currentBranch / isCleanTree / mergeBase / branchExists / isDescendant`

## frontmatter 绑定(packages/core/src/change/frontmatter.ts)

- proposal.md 的 YAML frontmatter 用 `yaml` 包 `parseDocument` 做注释保留式 upsert:`branch` / `base_sha` / `base_branch` 三键写入 `depends_on` 同级;无 frontmatter 时补 `---\n...\n---` 块
- `readBinding` / `writeBinding` 纯字符串进出(core 不碰 fs,文件读写由调用方注入)

## 生命周期(packages/core/src/change/lifecycle.ts)

- `deriveChangeId(description)`:动词前缀(bootstrap/port/add/update/remove/fix/release…)优先,kebab-case、ASCII、60 字符上限;`nextChangeId(existingIds)` = 语义 id(与 v1 默认一致,不用编号)
- `startChange(io+git, root, id)`:干净树门 → 当前在默认分支 → `git switch -c <prefix><id>`(prefix 默认 `sdd/`)→ 写绑定
- `attachChange`:当前分支上直接写绑定(干净树门不适用)
- `finalizeChange(root, id, {into?, method?})`:
  1. 读绑定 → 目标分支 = into > base_branch > defaultBranch
  2. 切目标分支 → `git merge --squash <branch>`(method=ff 时 `--ff-only`)
  3. 重命名 `changes/<id>` → `changes/archive/<YYYY-MM-DD>-<id>`
  4. 单条收口提交 `archive(sdd): <id>`(squash diff + 文档改名一次提交)
  5. best-effort:merge 冲突 → 打印 WARNING + 手工命令提示,仍完成文档改名与提交(与 v1 合同一致);删除特性分支留给 `--delete-branch`(默认不删)

## CLI

`apps/cli` 增 `change <new|start|attach|next-id|diff|finalize>`;`new --from` 走 deriveChangeId;`diff` = `git diff <base>...HEAD` 原样输出。

## 测试策略

- 单元:frontmatter 注释保留 upsert、id 推导、defaultBranch 解析(假 git io)
- 集成:临时 git 仓库全链路(new → start → 改文件提交 → finalize)断言:分支创建、frontmatter 三键、squash 单提交、归档目录名、收口 commit message;best-effort 冲突场景断言 WARNING + 归档仍完成
- BDD:`@executable` 场景驱动真实临时仓库(步骤内 spawn CLI)
