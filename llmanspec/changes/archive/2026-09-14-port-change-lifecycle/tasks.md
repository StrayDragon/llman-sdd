# Tasks

测试边界(seam):`packages/core` git/生命周期纯函数(假 io 单元)+ 临时 git 仓库集成测试(真实子进程)+ `@executable` BDD 场景(spawn CLI)。

- [x] T1 git 层:`runGit` 封装 + currentBranch/isCleanTree/mergeBase/defaultBranch(local-first)+ 单元测试
- [x] T2 frontmatter:注释保留式 readBinding/writeBinding + 单元测试
- [x] T3 id 与生命周期:deriveChangeId/nextChangeId + startChange/attachChange/finalizeChange(squash 默认、ff、best-effort 冲突)+ 集成测试
- [x] T4 CLI:`change new --from/start/attach/next-id/diff/finalize` 子命令接线 + `--help` 文案
- [x] T5 BDD:`change-lifecycle.feature` 的 `@executable` 场景(临时仓库 spawn CLI 全链路)
