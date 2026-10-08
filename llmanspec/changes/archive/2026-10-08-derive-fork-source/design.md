# design: attach 分叉源运行时推导、偏离警告与就地收口

## 背景与问题

(issue #7)`change attach` 无条件把 `base_branch` 记为默认分支:栈式/release 工作流审计失真,finalize 默认合并目标随之误指默认分支;共享 PR 分支就地收口需每次手写 `--into` 且自合并空转无提示。`start` 侧 r68 已做分叉保真,缺口在 `attach`。

2026-10-08 临时仓实测(证据见 proposal「Why」):本地 upstream 以 `rev-parse --symbolic-full-name <b>@{upstream}` 的 `refs/heads/*` 前缀可精确识别;`branch.<name>.base` 是 git-spice 等工具的显式信号;`git switch origin/x` 报 "a branch is expected" 硬失败(现状 `--base origin/x` 是端到端死路);`merge --squash <自身>` 是 exit 0 的 no-op。

## 决策(用户 2026-10-08 拍板)

**D1 推导管线四层,不做 merge-base 盲扫**。优先序 `--base` > `branch.<name>.base`(本地分支守卫)> 本地 upstream(`refs/heads/*` 且 ≠ 绑定分支)> 默认分支。否决盲扫:rebase/父分支合并后父关系漂移、同点分叉平局任意取——自动猜错比不猜更糟,且违背 issue 的"无法推导维持现状"兼容承诺。每层信号独立校验,非法即作废并落下一层,不中断。

**D2 local-only 统一**。推导与 `--base`(start/attach 同语义)均只接受本地分支名。remote-tracking upstream 是同名 push 目标而非分叉源(最常见形态),且 finalize `git switch origin/x` 硬失败——refs/remotes 形态从"门通过但 finalize 死路"改为"门处明确报错并提示本地分支名"。

**D3 就地收口显式化,不加旗标**。target == 绑定分支 → 跳过 switch/merge,经 warnings 通道输出就地收口提示行;归档改名与收口提交不变。改动收敛在 `mergeRenameCommit`(finalize/archive 共用一处),r69 的目标优先序与合并语义不动。

**D4 `init.defaultBranch` 第一候选**。`defaultBranch()` 序列最前加 `git config --get init.defaultBranch`,值在本地存在才采信。仅改变 main+master 并存时的平局(tie-break 从固定 main 优先 → 按用户偏好),严格不劣于现状;`git config` 连全局配置一起读,语义上是"新仓库默认值"影响存量仓库,但有本地存在守卫,无实际风险。

**警告通道**:复用 CLI 现有 `[WARNING]` → stderr 惯例(r81 同款);core 返回结构化 `baseSource` 不格式化输出(r40 分工);非交互模式天然同样输出。

## 边界

- `startChange` 经典路径不动(r14 门保证在默认分支,base 构造即正确);r68 的 `--base`/`--worktree` 记录语义不变,仅补同一偏离警告输出。
- r95 对 `--base` 的 local-only 收紧与 r44 并存:r44 的"存在 + ≠ 当前分支"校验保留,refs/remotes 形态改由 r95 拒绝;现有 r44/r68 场景用例均为本地分支,不反杀。
- 无 schema 变更、无配置变更、无迁移路径;`LLMAN_SDD_HARNESS_ACTIVE`、finalize/archive 验收语义不变。
- 测试 seam:复用 BDD runner(CLI 子进程,`tests/bdd/steps/lifecycle.ts`)+ unit 假 GitLike + 模板渲染 golden 门,不发明新边界。
