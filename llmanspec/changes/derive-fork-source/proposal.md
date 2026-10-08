---
depends_on: []
---

# attach 分叉源运行时推导、偏离警告与就地收口

## Why

(issue #7)在非默认分叉源上开发 change 时,`change attach` 无条件把 `base_branch` 记为仓库默认分支,有三个真实代价:

1. **审计失真**:栈式分支(topic2 ← topic1)、release 工作流、默认分支非 main/master 的仓库,`base_branch`/`base_sha` 记录的分叉源与实际不符;
2. **误合并风险**:`finalize` 默认合并目标 = `base_branch`,偏离场景下会把变更误合进默认分支,必须每次手写 `--into`;
3. **就地收口沉默**:共享 PR 分支上 `finalize --into <绑定分支>` 能跑,但自合并是空转且无任何提示说明这是就地收口。

`start` 侧 r68 已做分叉保真(`--base` > worktree 当前分支 > 默认),缺口集中在 `attach`。2026-10-08 临时仓实测证据:

- 本地 upstream(`branch.<name>.remote = "."`,`git branch --set-upstream-to=<本地分支>` 写入)经 `rev-parse --symbolic-full-name <b>@{upstream}` 输出 `refs/heads/<base>`,前缀可精确区分本地/远程;
- `branch.<name>.base` 为 git-spice 等栈式工具与手写用户使用的显式信号,`git config --get` 可探测;
- `git switch origin/x` → `fatal: a branch is expected, got remote branch 'origin/main'` exit 128、checkout 不变——现状 `--base origin/x`(门接受 refs/remotes)在 finalize 端到端跑不通,是死路;
- `merge --squash <自身>` → `Already up to date. (nothing to squash)` exit 0——就地收口今天已是 no-op,缺的只是"说清楚"。

## What Changes

- **core(git 适配)**:`packages/core/src/git/spawnGit.ts`
  - `defaultBranch()` 序列最前新增 `init.defaultBranch` 候选(`git config --get init.defaultBranch`,值在本地存在才采信;仅改变 main+master 并存时的平局,严格不劣于现状);
  - 新增只读探测器 `probeForkSource(git, branch)`:`branch.<name>.base`(值为本地分支才采信)> 本地 upstream(`refs/heads/*` 前缀且 ≠ 绑定分支);remote-tracking upstream、无 upstream、config 值非法 → 返回 null(不可推导);
  - `--base` 门(start/attach 共用语义)收紧为**仅本地分支**:refs/remotes 不再接受,报错提示使用本地分支名。
- **core(lifecycle)**:`packages/core/src/change/lifecycle.ts`
  - `attachChange`:缺省 base 改为 `--base` > `probeForkSource` > `defaultBranch()`,返回值新增 `baseSource: 'flag' | 'config' | 'upstream' | 'default'`;
  - `startChange` 经典路径不动(r14 门保证在默认分支,构造即正确);`--worktree`/`--base` 路径记录非默认分支时与 attach 共用偏离警告;
  - `mergeRenameCommit`:target == 绑定分支时跳过 switch/merge,warnings 追加就地收口提示行(finalize/archive 一处改两处收);r69 优先序(into > base_branch > 默认分支)不变。
- **CLI**:`apps/cli/src/commands/change.ts` — attach/start 在 `记录值 ≠ defaultBranch()` 时向 stderr 输出 `[WARNING]`(含解析到的 base、来源与 `--base` 覆盖提示;非交互模式同样输出);core 不格式化输出(r40 分工)。
- **specs**:`llmanspec/specs/change-lifecycle.feature` — r16 修订(新候选 + 场景)、新 req「attach 分叉源运行时推导与偏离警告」(含 `--base` local-only 收紧)、新 req「finalize/archive 就地收口」;BDD 步骤绑定 `tests/bdd/steps/lifecycle.ts` 扩展。
- **模板与文档**(用户点名):`packages/core/templates/{zh-Hans,en}/skills/` 中提及 attach/`--base`/finalize 就地语义的技能文案(propose/archive/quick/wayfinder/ff 等)同步,`init --update` 重渲染 + golden 基线重生;`llmanspec/AGENTS.md` frontmatter SSOT 表 `base_branch` 行("attach --base 可覆盖" → 推导序口径)。

## Capabilities

- `change-lifecycle`:r16 修订 + 2 个新 req(推导与偏离警告;就地收口)及配套嵌套场景(可执行,BDD runner 驱动 CLI 子进程 seam)。

## Impact

- **兼容性**:裸 attach 无任何信号 → 仍记默认分支(issue 自身的兼容承诺"无法推导维持现状");`--base origin/x` 调用从"门通过但 finalize 硬失败"变为"门处明确报错"——行为收紧但死路变活路提示,现有 r44/r68 场景用例均为本地分支,不反杀;
- 无 schema 变更、无配置变更、无迁移路径;`LLMAN_SDD_HARNESS_ACTIVE`/`--no-check` 等验收语义不变;
- 测试面:unit(假 GitLike 探测器)+ BDD(新场景步骤)+ integration(就地收口)。

## 决策记录(2026-10-08 与用户定案)

- **D1 推导管线**:`--base` > `branch.<name>.base` > 本地 upstream > 默认分支;**砍掉 merge-base 盲扫**——rebase/合并后父关系漂移、同点分叉平局任意取,自动猜错比不猜更糟,且违背 issue 的"无法推导维持现状"承诺。
- **D2 local-only**:推导与 `--base` 均只接受本地分支名。remote-tracking upstream 是同名 push 目标而非分叉源;且 finalize `git switch origin/x` 会以 "a branch is expected" 硬失败(实测),收 refs/remotes 是端到端死路。
- **D3 就地收口**:target == 绑定分支 → 显式跳过 merge + warnings 提示行,不新增旗标;现有 `--into <绑定分支>` 用法从"沉默空转"升级为"明确声明"。
- **D4 默认分支检测**:`defaultBranch()` 最前加 `init.defaultBranch`(本地存在守卫)——回应"读用户本地仓库配置定 main/master";只影响 main+master 并存的歧义局面,把 tie-break 从固定 main 优先变为按用户偏好。
