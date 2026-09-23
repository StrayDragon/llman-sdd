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
    - `change finalize` MUST 以 squash(默认)或 ff 把特性分支合并到目标分支(into > base_branch > 默认分支),将 `changes/<id>` 重命名为 `changes/archive/<YYYY-MM-DD>-<id>`,并以单条提交 `archive(sdd): <id>` 收口;finalize MUST 校验当前分支 == binding.branch,不满足 MUST 在任何写入前报错退出(非默认分支由绑定语义保证,v1 r94 语义);合并冲突时 MUST best-effort:输出 WARNING 与手工命令提示,仍完成归档改名与提交。

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

  @req:r35 @human
  场景: next-id 数字编号计数
    - `change next-id` MUST 无参数执行,递归扫描 `llmanspec/` 全树目录名(任意深度,跳过符号链接与点目录)提取编号:内置启发式 MUST 取 token 边界上的 `c<数字>` 串(大小写不敏感,匹配 c2790、c10-active 与 2026-01-01-c20-slug 等形态),纯前导数字名(如 3-third)MUST NOT 计入;人读输出 MUST 为 `max number in tree: N`(无编号时 `no numbered change dirs found in tree`)加 `next free number: M` 两行;`--json` MUST 输出 {maxNumber, nextNumber, warnings},无编号时 maxNumber MUST 为 null 且 nextNumber MUST 为 1;本命令 MUST 为只读,不创建任何目录;归档内条目扫描 SHALL 为 best-effort 扩展,v2 最小实现不进入冻结包。

  @req:r35 @executable
  场景: 编号扫描与 next free
    假如 一个含 c10-active 与嵌套 c2620 目录的 llmanspec 树
    当 运行 change next-id --json
    那么 maxNumber 为 2620 且 nextNumber 为 2621

  @req:r36 @executable
  场景: dry-run 零副作用
    假如 一个已初始化的临时 llmanspec 工作区
    当 运行 change new --from "port the importer" --dry-run
    那么 输出派生 id 且不创建 changes 目录

  @req:r36 @human
  场景: change new --dry-run 派生预览
    - `change new --from <描述> --dry-run` MUST 仅输出将派生的 change id 并成功退出,MUST NOT 创建任何文件;`<id>` 与 `--from` 的互斥规则 MUST NOT 因 `--dry-run` 改变。

  @req:r39 @human
  场景: change archive 独立收口
    - `change archive <id>` MUST 独立于 finalize 完成合并与改名收口,合并语义与 finalize 一致(into > base_branch > 默认分支;method > config sdd.merge_method > squash;合并失败 best-effort 不回滚);MUST 要求绑定存在、当前在绑定分支、非默认分支且工作树干净,任一不满足 MUST 报错且零副作用;`--into`/`--method` MUST 与 finalize 同义;`--dry-run` MUST 仅输出改名计划。

  @req:r40 @human
  场景: change archive 任务门禁
    - `change archive` MUST 在 tasks.md 存在未勾选任务时报错并列出全部未勾项(无条件阻断,strict_defer 不参与本门,其升级语义属 validate 域);config `archive.min_completion_ratio` MUST 作为最低完成率门,低于门禁 MUST 报错;hidden `--force` MUST 跳过全部任务门禁与 git 门禁。

  @req:r39 @executable
  场景: archive 独立收口
    假如 一个已 start 且任务全勾的临时仓库
    当 运行 change archive
    那么 目标分支获得 archive(sdd) 提交且目录改名

  @req:r40 @executable
  场景: archive 任务门禁
    假如 一个带未勾任务的已绑定 change 仓库
    当 运行 change archive
    那么 报错列出未勾任务且不产生归档

  @req:r44 @human
  场景: change new/attach 兼容 flag
    - `change new` MUST 支持 `--force`(覆盖已存在 proposal,v1 文案 `change proposal already exists: ... (pass --force to overwrite)`)与 `--verb <V>`(v1 语义:显式覆盖 verb,无显式时按描述自动识别 add/update/remove/refactor/fix 动词前缀,subject 为剥离该动词前缀后的描述主体);`change attach` MUST 支持 `--force`(已绑定 change 重绑到当前分支)与 `--base <branch>`(显式记录 fork 源分支,该分支 MUST 存在且 MUST NOT 等于当前分支)。

  @req:r45 @human
  场景: start 前缀与 finalize 校验/收口的取值序
    - `change start` 分支前缀 MUST 依次取 CLI `--branch-prefix`、config `sdd.branch_prefix`、缺省 `sdd/`;`change finalize` MUST 在合并前执行一次 specs 与 change 文档校验 sweep,失败 MUST 中止且不产生合并与改名,`--no-check` MUST 跳过该 sweep;合并方式 MUST 依次取 `--method`、config `sdd.merge_method`、缺省 squash;`--no-commit` MUST 完成改名但跳过自动提交并输出手工收尾指引。

  @req:r46 @human
  场景: change diff 结构化输出
    - `change diff <id>` MUST 支持 `--json`(输出 {change, branch, base, commitCount})与 `--export-patch <path>`(diff 内容写文件而非 stdout,路径不作为 SSOT)。

  @req:r44 @executable
  场景: attach 重绑与显式 base
    假如 一个已 attach 的 feature 分支仓库
    当 无 force 再次运行 change attach
    那么 报错提示已绑定
    当 带 --force --base main 运行 change attach
    那么 重绑成功且 base_branch 记录为 main

  @req:r45 @executable
  场景: finalize no-commit 收口
    假如 一个已完成 start 并在特性分支有新提交的临时仓库
    当 运行 change finalize --no-commit
    那么 目录改名完成且工作区留有未提交改动

  @req:r46 @executable
  场景: diff 结构化输出
    假如 一个已完成 start 并在特性分支有新提交的临时仓库
    当 运行 change diff --json
    那么 commitCount 为 1 且 change 与 branch 字段正确

  @req:r60 @human
  场景: change_id template 渲染
    - config `change_id.template` 存在时,`change new --from` 的 id MUST 由模板渲染生成(nunjucks Strict:未定义变量引用 MUST 报错);内置变量 MUST 为 llman_sdd_unique_id(全树含归档的最小空闲编号)、verb(--verb 显式覆盖或按五动词表自动识别,描述无动词且模板引用 {{ verb }} 时 MUST 报 unprovided variable)、subject(描述派生 id 剥离检测到的动词前缀)与 date(YYYY-MM-DD);渲染 id 派生遵循 v1 纯 slug 语义(无动词强制);未配置 template 时 MUST 保持启发式派生不变。

  @req:r60 @executable
  场景: template 渲染派生 id
    假如 一个配置了 change_id.template 的临时仓库
    当 运行 change new --from 并带 --verb
    那么 派生 id 由模板渲染生成

  @req:r16 @executable
  场景: 默认分支解析顺序与皆缺报错
    假如 一个默认分支布局为 main+master 的临时仓库
    当 运行 change start
    那么 base_branch 记录为 main
    假如 一个默认分支布局为 master-only 的临时仓库
    当 运行 change start
    那么 base_branch 记录为 master
    假如 一个默认分支布局为 origin-head 的临时仓库
    当 运行 change start
    那么 base_branch 记录为 devel
    假如 一个默认分支布局为 origin-branch 的临时仓库
    当 运行 change start
    那么 base_branch 记录为 zside
    假如 一个默认分支布局为 none 的临时仓库
    当 运行 change start
    那么 报错提示缺少默认分支
