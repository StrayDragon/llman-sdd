# tasks

测试边界（seam）：复用既有 BDD runner（`tests/bdd/steps/lifecycle.ts`，CLI 子进程）+ unit 假 GitLike（`tests/unit/lifecycle.test.ts` 家族）+ 模板渲染 golden 门，不发明新边界。

## t1 默认分支候选与探测器（core + r16）

- [ ] T1: `spawnGit.ts` `defaultBranch()` 最前新增 `init.defaultBranch` 候选（`git config --get`，值本地存在才采信）+ unit 用例（main+master 并存按用户偏好 tie-break；无配置/值不存在回退现状序）
- [ ] T2: `spawnGit.ts` 新增只读 `probeForkSource(git, branch)`：`branch.<name>.base`（本地分支守卫）> 本地 upstream（`refs/heads/*` 且 ≠ 绑定分支）；remote-tracking/无信号/非法值 → null + unit 假 GitLike 用例（config、upstream、同名 push 目标、无信号四形态）

## t2 attach 推导接入与 --base 收紧（core + CLI + 新 req）

- [ ] T3: `lifecycle.ts` `attachChange` 缺省 base 改为 `--base` > `probeForkSource` > `defaultBranch()`，返回新增 `baseSource`；start/attach 的 `--base` 门收紧为仅本地分支（refs/remotes 拒绝，报错含本地分支名提示）[blocked-by: T2]
- [ ] T4: `change.ts` attach/start 在记录值 ≠ 默认分支时向 stderr 输出 `[WARNING]`（含 base、来源、`--base` 覆盖提示；core 不格式化输出）[blocked-by: T3]
- [ ] T5: change-lifecycle.feature 新 req「attach 分叉源运行时推导与偏离警告」嵌套场景：config 推导、本地 upstream 推导、无信号回退默认且无警告、偏离警告输出、`--base origin/x` 被拒；`steps/lifecycle.ts` 步骤绑定 [blocked-by: T4]

## t3 就地收口（core + 新 req + integration）

- [ ] T6: `mergeRenameCommit` target == 绑定分支时跳过 switch/merge，warnings 追加就地收口提示行（finalize/archive 共用；r69 优先序不变）+ integration 用例（就地 finalize 改名/提交照常、无 merge 空转）
- [ ] T7: change-lifecycle.feature 新 req「finalize/archive 就地收口」嵌套场景：`--into <绑定分支>` 输出提示行且目标分支获得 archive 提交、目录改名产物正确；`steps/lifecycle.ts` 步骤绑定 [blocked-by: T6]

## t4 start 侧警告一致性与收尾门

- [ ] T8: start `--base`/`--worktree` 记录非默认分支时输出同一偏离警告（r68 行为不变，仅补输出）+ BDD 场景 [blocked-by: T4]
- [ ] T9: 模板与文档同步：`packages/core/templates/{zh-Hans,en}/skills/` 涉及 attach/`--base`/finalize 就地语义文案（propose/archive/quick/wayfinder/ff 等）、`llmanspec/AGENTS.md` frontmatter SSOT `base_branch` 行；`init --update` 重渲染 + golden 基线重生 [blocked-by: T5, T7, T8]
- [ ] T10: 全量门禁：`just qa`（check + 全部测试 + skills 渲染门 + pending + schema）与 `validate derive-fork-source --strict` 全绿（分支上相对 merge-base）
