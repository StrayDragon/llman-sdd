# language: zh-CN
# capability: change-lifecycle
# purpose: 定义 change 生命周期的 git-native 合同:分支绑定、frontmatter、finalize 合并与归档收口。
# scope: packages/core/src/git/, packages/core/src/change/, apps/cli/src/

功能: change-lifecycle

  @req:r14 @human
  场景: 分支绑定门
    - `change start` MUST 要求干净工作树且当前在默认分支,创建 `<branch_prefix><id>` 分支(默认前缀 sdd/)并把 branch/base_branch/base_sha 三键以注释保留方式写入 proposal.md frontmatter;不满足门条件 MUST 报错且不产生任何变更。

  @req:r14 @executable
  场景: start 全链路
    假如 一个已提交的临时 git 仓库含 change "demo-add-feature" 的 proposal
    当 对其运行 change start
    那么 分支 sdd/demo-add-feature 被创建且被检出
    而且 frontmatter 含 branch 与 base_branch

  @req:r15 @human
  场景: finalize 合并与归档收口
    - `change finalize` MUST 以 squash(默认)或 ff 把特性分支合并到目标分支(into > base_branch > 默认分支),将 `changes/<id>` 重命名为 `changes/archive/<YYYY-MM-DD>-<id>`,并以单条提交 `archive(sdd): <id>` 收口;合并冲突时 MUST best-effort:输出 WARNING 与手工命令提示,仍完成归档改名与提交。

  @req:r15 @executable
  场景: squash 收口
    假如 一个已完成 start 并在特性分支有新提交的临时仓库
    当 对其运行 change finalize
    那么 目标分支获得单条 archive(sdd) 提交
    而且 changes 目录下只剩 archive 改名产物
    而且 特性分支上的变更内容出现在目标分支

  @req:r16 @human
  场景: 默认分支 local-first 解析
    - 默认分支 MUST 按 main → master → origin/HEAD → origin/* 顺序取第一个本地存在者;四者皆缺 MUST 报错。

  @req:r31 @human
  场景: attach 默认分支门
    - `change attach` MUST 拒绝在默认分支上执行(报错且不写任何绑定),错误信息 MUST 含默认分支名与建议动作(创建/切换 feature 分支或改用 `change start`);detached HEAD MUST 同样报错;绑定门与 `change start` 的分支门语义保持一致。

  @req:r31 @executable
  场景: attach 默认分支被拒
    假如 一个已提交的临时 git 仓库含 change "demo-attach" 的 proposal
    当 在默认分支上对其运行 change attach
    那么 attach 报错且不写绑定
    当 切到特性分支再运行 change attach
    那么 attach 绑定写入当前分支

  @req:r34 @human
  场景: stage 单调推断规则
    - change stage MUST 按文件存在单调判定:draft(仅 proposal)→ designed(有 design.md)→ planned(design.md 与 tasks.md 双全)→ full(另有 branch 绑定);仅有 tasks.md 而无 design.md MUST 仍判 draft;stage MUST 为纯推断量,MUST NOT 写入任何文件。


  @req:r34 @executable
  场景: tasks-only 判 draft
    假如 一个只有 proposal 与 tasks 的 change 工作区
    当 运行 list --json
    那么 该 change 的 stage 为 draft
