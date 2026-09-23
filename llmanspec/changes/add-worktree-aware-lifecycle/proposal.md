---
depends_on: []
needs_specs_change: true
---

# worktree 感知的 change 生命周期:start --worktree / 分叉保真 / finalize 目标灵活度

## Why

2026-09-23 worktree 适配调研(F1-F6)坐实三类硬伤:① finalize/archive 在"目标分支被其他 worktree 持有"时 `git switch target` 直接抛错,而 skills 文档声称存在"跳过并打印手动命令"的降级——文档与实现脱节(当日并行收口实证);② config schema 已定义 `sdd.worktree_root`/`worktree_naming` 并描述 `change start --worktree`,但 CLI 零实现零消费;③ `change start` 硬性 `switch -c` 劫持当前 checkout 且 base 恒取默认分支——分叉来源信息丢失,wt/git-worktree 用户的真实分叉点(不一定是 main)无 处记录。attach 已有 `--base`(r44),start/finalize 缺齐。

## What Changes

Specs landing:`llmanspec/specs/change-lifecycle.feature` 新增两条规则(全局编号 r68/r69,含 @executable)。

1. **r68 start 分叉保真与 worktree 模式**:
   - `change start --base <branch>`:fork 源显式化——base_branch 记录该分支(须存在且不等于新分支);--base 给定时豁免「当前在默认分支」门(干净树门保持)。
   - `change start --worktree`:不切换当前检出——分支建好后于 `sdd.worktree_root`(缺省仓库根兄弟目录)以 `worktree_naming`(id|hash,缺省 id)创建 worktree 并在其中检出新分支;绑定照写;**fork 源 = --base 显式 > 当前分支(记录实际来源,不一定是默认分支)**;当前 checkout 保持原分支,输出 worktree 路径。
   - 无旗标经典路径行为逐字节不变(v1 parity)。
2. **r69 finalize/archive worktree 感知目标执行**:
   - 合并目标被其他 worktree 持有时:持有 worktree 干净 → 在该 worktree 内执行合并+改名+提交(输出等效,标注执行位置);脏 → 报错含该 worktree 路径与处置指引,零副作用。
   - `--into` 优先序(into > base_branch > 默认)不变;持有检测用 `git worktree list --porcelain`。
   - skills 文档的降级描述由虚转实(archive.md 的既有句终于为真,措辞对齐实现)。
3. **模板引导(R5)**:git-native-flow.md / git-native-flow-brief.md 增补「worktree 模式」决策表(start 经典 / start --worktree / attach 的选择判据 + finalize 目标定位);propose.md 的 start 指引同步一句。zh+en,随 golden/对账门/狗粮三联动。

## Capabilities

- change-lifecycle(r68/r69,Specs landing)

## Impact

- 行为合约变更(新增 start 旗标与 finalize 持有执行语义);经典路径零变化
- config `sdd.worktree_root`/`worktree_naming` 从"文档存在"转为真实消费(字段本身已在 r5 顶层域内合法)
- 模板改动随 golden/对账门/dogfood 三联动;本仓 AGENTS.md 的 wt playbook 与产品行为就此对齐(前人栽树:手工流程产品化)
