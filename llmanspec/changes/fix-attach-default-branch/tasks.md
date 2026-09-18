# Tasks

测试接缝(seam):复用既有 seam——`attachChange` 域函数(临时 git 仓库 fixture,单测)与 BDD steps(临时仓库 + spawn CLI),不发明新 seam。

- [ ] T1: 单测先行(红)——默认分支上 attach 抛 LifecycleError 且 proposal frontmatter 不含 branch 键;feature 分支 attach 通过;detached HEAD 拒绝 [blocked-by: 无]
- [ ] T2: 实现(绿)——`lifecycle.ts` attach 入口复用默认分支解析(spawnGit 现有 resolveDefaultBranch),命中即抛错,错误文案含默认分支名与建议动作 [blocked-by: T1]
- [ ] T3: BDD 场景落地(红)——`change-lifecycle.feature` 增 `@req:r31 @executable` 场景(默认分支 attach 被拒、feature 分支 attach 成功),`tests/bdd/steps/domain.ts` 补 step [blocked-by: T2]
- [ ] T4: 门禁全绿——`bun run qa`;v1 二进制对拍(默认分支 attach 报错语义一致:两边都非零退出且不写绑定) [blocked-by: T3]
