# language: zh-CN
# capability: change-lifecycle
# purpose: 定义 change 生命周期的 git-native 合同:分支绑定、frontmatter、finalize 合并与归档收口。
# scope: packages/core/src/git/, packages/core/src/change/, apps/cli/src/commands/change.ts

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
    而且 frontmatter base_sha 等于默认分支与新分支的 merge-base

  @req:r14 @executable
  场景: start 门失败零写入
    假如 一个已提交的临时 git 仓库含 change "demo-dirty" 的 proposal
    当 弄脏工作树后对其运行 change start
    那么 报错含 "requires a clean working tree" 且未创建分支 sdd/demo-dirty
    而且 proposal 内容未变

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

  @req:r15 @executable
  场景: finalize 非绑定分支零写入
    假如 一个已完成 start 并在特性分支有新提交的临时仓库
    当 切到另一分支后运行 change finalize
    那么 报错含 "must run on the bound branch" 且目标分支无新提交
    而且 change 目录未被改名

  @req:r15 @executable
  场景: finalize 合并冲突 best-effort
    假如 一个目标分支与特性分支修改同一文件同一行的已 start 临时仓库
    当 对其运行 change finalize
    那么 输出含合并冲突 WARNING 与手工命令提示
    而且 目标分支获得 archive 提交
    而且 changes 目录下只剩 archive 改名产物

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

  @req:r31 @executable
  场景: attach 报错文案与 detached HEAD
    假如 一个已提交的临时 git 仓库含 change "demo-attach2" 的 proposal
    当 在默认分支上对其运行 change attach
    那么 报错含默认分支名 "main" 与建议动作 "change start"
    当 在 detached HEAD 上对其运行 change attach
    那么 报错含 "refuses a detached HEAD" 且不写绑定

  @req:r34 @human
  场景: stage 单调推断规则
    - change stage MUST 按文件存在单调判定:draft(仅 proposal)→ designed(有 design.md)→ planned(design.md 与 tasks.md 双全)→ full(另有 branch 绑定);仅有 tasks.md 而无 design.md MUST 仍判 draft;stage MUST 为纯推断量,MUST NOT 写入任何文件。


  @req:r34 @executable
  场景: tasks-only 判 draft
    假如 一个只有 proposal 与 tasks 的 change 工作区
    当 运行 list --json
    那么 该 change 的 stage 为 draft

  @req:r34 @executable
  场景: stage 单调推断全阶段
    假如 一个含仅 proposal、含 design、含 design 与 tasks、已绑定四种形态 change 的临时仓库
    当 运行 list --json
    那么 四个 change 的 stage 依次为 draft、designed、planned、full
    而且 各 proposal 均不含 stage 字段

  @req:r35 @human
  场景: next-id 数字编号计数
    - `change next-id` MUST 无参数执行,递归扫描 `llmanspec/` 全树目录名(任意深度,跳过符号链接与点目录)提取编号:内置启发式 MUST 取 token 边界上的 `c<数字>` 串(大小写不敏感,匹配 c2790、c10-active 与 2026-01-01-c20-slug 等形态),纯前导数字名(如 3-third)MUST NOT 计入;人读输出 MUST 为 `max number in tree: N`(无编号时 `no numbered change dirs found in tree`)加 `next free number: M` 两行;`--json` MUST 输出 {maxNumber, nextNumber, warnings},无编号时 maxNumber MUST 为 null 且 nextNumber MUST 为 1;本命令 MUST 为只读,不创建任何目录;归档内条目扫描 SHALL 为 best-effort 扩展,v2 最小实现不进入冻结包。
    - 扫描范围 MUST 为当前工作树加全部关联 git worktree(`git worktree list --porcelain`,路径去重)各自的 `llmanspec/` 全树;worktree list 失败 SHALL 退化为仅当前树(best-effort,与归档扫描同级)并在 warnings 记录退化;同一编号出现于多个 worktree 时 `--json` 的 warnings MUST 给出提示(含该编号与 worktree 路径);human 两行输出形态 MUST 不变。

  @req:r35 @executable
  场景: 编号扫描与 next free
    假如 一个含 c10-active 与嵌套 c2620 目录的 llmanspec 树
    当 运行 change next-id --json
    那么 maxNumber 为 2620 且 nextNumber 为 2621

  @req:r35 @executable
  场景: next-id 吸收关联 worktree 的更大编号
    假如 一个主检出含 c10 且关联 worktree 含更高编号目录的临时仓库
    当 在主检出运行 change next-id --json
    那么 跨 worktree maxNumber 为 2620 且 nextNumber 为 2621

  @req:r35 @executable
  场景: 同编号跨 worktree 提示
    假如 一个主检出与关联 worktree 均含相同编号目录的临时仓库
    当 在主检出运行 change next-id --json
    那么 warnings 提示编号 2620 出现在多个 worktree

  @req:r35 @executable
  场景: 纯前导数字目录不计编号
    假如 一个仅含 3-third 与 2026-01-01-slug 目录的 llmanspec 树
    当 运行 change next-id --json
    那么 maxNumber 为 null 且 nextNumber 为 1
    当 运行 change next-id
    那么 stdout 恰为 "no numbered change dirs found in tree" 与 "next free number: 1" 两行

  @req:r36 @executable
  场景: dry-run 零副作用
    假如 一个已初始化的临时 llmanspec 工作区
    当 运行 change new --from "port the importer" --dry-run
    那么 输出派生 id 且不创建 changes 目录

  @req:r36 @executable
  场景: dry-run 不改变 id 与 --from 互斥
    假如 一个已初始化的临时 llmanspec 工作区
    当 同时给出 id 与 --from 并带 --dry-run 运行 change new
    那么 报错且不创建 changes 目录

  @req:r36 @human
  场景: change new --dry-run 派生预览
    - `change new --from <描述> --dry-run` MUST 仅输出将派生的 change id 并成功退出,MUST NOT 创建任何文件;`<id>` 与 `--from` 的互斥规则 MUST NOT 因 `--dry-run` 改变。

  @req:r39 @human
  场景: change archive 独立收口
    - `change archive <id>` MUST 独立于 finalize 完成合并与改名收口,合并语义与 finalize 一致(into > base_branch > 默认分支;method > config sdd.merge_method > squash;合并失败 best-effort 不回滚);MUST 要求绑定存在、当前在绑定分支、非默认分支且工作树干净,任一不满足 MUST 报错且零副作用;`--into`/`--method` MUST 与 finalize 同义;`--dry-run` MUST 仅输出改名计划。

  @req:r40 @human
  场景: change archive 任务门禁
    - `change archive` MUST 在 tasks.md 存在未勾选任务时报错并列出全部未勾项(无条件阻断,strict_defer 不参与本门,其升级语义属 validate 域);任务门判定 MUST 只有一处实现(core),CLI 仅负责呈现;hidden `--force` MUST 跳过全部任务门禁与 git 门禁。

  @req:r39 @executable
  场景: archive 独立收口
    假如 一个已 start 且任务全勾的临时仓库
    当 运行 change archive
    那么 目标分支获得 archive(sdd) 提交且目录改名

  @req:r39 @executable
  场景: change archive 遗留兼容旗标为 unknown option
    假如 一个已 start 且任务全勾的临时仓库
    当 运行 change archive 并附加遗留兼容旗标
    那么 报 unknown option 且归档未产生

  @req:r39 @executable
  场景: archive 门禁与 dry-run
    假如 一个已 start 且任务全勾的临时仓库
    当 运行 change archive --dry-run
    那么 输出改名计划且目标分支无新提交且 change 目录未被改名
    当 弄脏工作树后运行 change archive
    那么 报错含 "requires a clean working tree" 且目标分支无新提交
    当 清理工作树并切到默认分支后运行 change archive
    那么 报错且目标分支无新提交

  @req:r40 @executable
  场景: archive 任务门禁
    假如 一个带未勾任务的已绑定 change 仓库
    当 运行 change archive
    那么 报错列出未勾任务且不产生归档
    当 运行 change archive --force
    那么 目标分支获得 archive(sdd) 提交且目录改名

  @req:r79 @human
  场景: finalize/archive 任务门收口伪任务点名
    - `change finalize` 与 `change archive` 的任务门被拒(存在未勾选任务)时,若未勾项中存在去掉 `T<n>[a-z]?:` 编号前缀后以收口动词开头(`/^(收口|归档|finalize\b|archive\b)/` 只匹配开头)的标题,MUST 在报错末尾追加与 validation WARNING 同一文案常量的提示(含 `finalize is a pipeline step`),指明该任务是流水线步骤应从 tasks.md 移除;提示文案 MUST 与 validate 域单一定义、两处复用。

  @req:r79 @executable
  场景: 任务门拒绝时点名收口伪任务
    假如 一个已完成 start 且 tasks.md 含未勾选任务「- [ ] T6: 收口——finalize」的临时仓库
    当 对其运行 change finalize
    那么 报错列出未勾任务且含 "finalize is a pipeline step"
    而且 目标分支无新提交且 change 目录未被改名

  @req:r44 @human
  场景: change new/attach 兼容 flag
    - `change new` MUST 支持 `--force`(覆盖已存在 proposal,v1 文案 `change proposal already exists: ... (pass --force to overwrite)`)与 `--verb <V>`(v1 语义:显式覆盖 verb,无显式时按描述自动识别 add/update/remove/refactor/fix 动词前缀,subject 为剥离该动词前缀后的描述主体);`change attach` MUST 支持 `--force`(已绑定 change 重绑到当前分支)与 `--base <branch>`(显式记录 fork 源分支,该分支 MUST 存在且 MUST NOT 等于当前分支)。

  @req:r45 @human
  场景: start 前缀与 finalize 校验/收口的取值序
    - `change start` 分支前缀 MUST 依次取 CLI `--branch-prefix`、config `sdd.branch_prefix`、缺省 `sdd/`;`change finalize` MUST 在合并前执行一次 specs 与 change 文档校验 sweep,失败 MUST 中止且不产生合并与改名,`--no-check` MUST 跳过该 sweep;合并方式 MUST 依次取 `--method`、config `sdd.merge_method`、缺省 squash;`--no-commit` MUST 完成改名但跳过自动提交并输出手工收尾指引。

  @req:r46 @human
  场景: change diff 结构化输出
    - `change diff <id>` MUST 支持 `--json`(输出 {change, branch, base, commitCount})与 `--export-patch <path>`(diff 内容写文件而非 stdout,路径不作为 SSOT);`commitCount` MUST 为 `merge-base(base_branch, branch)..branch` 的提交数(base_branch 缺键回退默认分支),MUST NOT 依赖 frontmatter `base_sha`;`base` 字段 MUST 回显 frontmatter `base_sha`(v1 输出形状,仅审计)。

  @req:r44 @executable
  场景: attach 重绑与显式 base
    假如 一个已 attach 的 feature 分支仓库
    当 无 force 再次运行 change attach
    那么 报错提示已绑定
    当 带 --force --base main 运行 change attach
    那么 重绑成功且 base_branch 记录为 main

  @req:r44 @executable
  场景: change new 覆盖与显式 verb
    假如 一个已初始化的临时 llmanspec 工作区
    当 对已存在的 change id 运行 change new
    那么 报错含 "pass --force to overwrite" 且原 proposal 未变
    当 带 --force 再次运行 change new
    那么 proposal 被覆盖为骨架
    当 运行 change new --from "the importer" --verb fix --dry-run
    那么 派生 id 以 "fix-" 开头

  @req:r45 @executable
  场景: finalize no-commit 收口
    假如 一个已完成 start 并在特性分支有新提交的临时仓库
    当 运行 change finalize --no-commit
    那么 目录改名完成且工作区留有未提交改动

  @req:r45 @executable
  场景: start 前缀取值序
    假如 一个已提交的临时 git 仓库含 change "demo-prefix" 的 proposal 且 config sdd.branch_prefix 为 "cfg/"
    当 对其运行 change start
    那么 分支 cfg/demo-prefix 被创建且被检出
    当 回到默认分支并以 --branch-prefix "cli/" 对新 change "demo-prefix2" 运行 change start
    那么 分支 cli/demo-prefix2 被创建且被检出

  @req:r45 @executable
  场景: finalize 预合并校验 sweep
    假如 一个已完成 start 并在特性分支有新提交且 live specs 含种子缺陷的临时仓库
    当 对其运行 change finalize
    那么 报错含 "validation sweep failed" 且目标分支无新提交
    而且 change 目录未被改名
    当 运行 change finalize --no-check
    那么 目标分支获得单条 archive(sdd) 提交

  @req:r45 @executable
  场景: 合并方式取值序
    假如 一个已完成 start 并在特性分支有两个新提交且 config sdd.merge_method 为 "ff" 的临时仓库
    当 对其运行 change finalize
    那么 目标分支包含特性分支的两个原始提交
    当 以 --method bogus 运行 change finalize
    那么 报错含 "invalid --method"

  @req:r46 @executable
  场景: diff 结构化输出
    假如 一个已完成 start 并在特性分支有新提交的临时仓库
    当 运行 change diff --json
    那么 commitCount 为 1 且 change 与 branch 字段正确

  @req:r46 @executable
  场景: diff 计数不受基线前进与 base_sha 影响
    假如 一个已完成 start 并在特性分支有新提交的临时仓库
    当 在默认分支追加 2 个提交后运行 change diff --json
    那么 commitCount 为 1 且 change 与 branch 字段正确
    当 把 frontmatter base_sha 改写为默认分支最新提交后运行 change diff --json
    那么 commitCount 为 1 且 base 字段回显改写后的 base_sha

  @req:r46 @executable
  场景: diff 导出补丁文件
    假如 一个已完成 start 并在特性分支有新提交的临时仓库
    当 运行 change diff --export-patch out/change.patch
    那么 out/change.patch 含特性提交的 diff 且 stdout 不含 diff 正文

  @req:r60 @human
  场景: change_id template 渲染
    - config `change_id.template` 存在时,`change new --from` 的 id MUST 由模板渲染生成(nunjucks Strict:未定义变量引用 MUST 报错);内置变量 MUST 为 llman_sdd_unique_id(全树含归档的最小空闲编号)、verb(--verb 显式覆盖或按五动词表自动识别,描述无动词且模板引用 {{ verb }} 时 MUST 报 unprovided variable)、subject(描述派生 id 剥离检测到的动词前缀)与 date(YYYY-MM-DD);渲染 id 派生遵循 v1 纯 slug 语义(无动词强制);未配置 template 时 MUST 保持启发式派生不变。

  @req:r60 @executable
  场景: template 渲染派生 id
    假如 一个配置了 change_id.template 的临时仓库
    当 运行 change new --from 并带 --verb
    那么 派生 id 由模板渲染生成

  @req:r60 @executable
  场景: template 未定义变量报错
    假如 一个 change_id.template 引用未定义变量 "{{ nope }}" 的临时仓库
    当 运行 change new --from "add thing" --dry-run
    那么 报错含 "nope" 且不创建 changes 目录
    当 把 template 改为引用 "{{ verb }}" 后以无动词描述 "the thing" 运行 change new --from --dry-run
    那么 报错含 "verb"

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

  @req:r68 @human
  场景: start 分叉保真与 worktree 模式
    - `change start` MUST 支持 `--base <branch>` 显式记录分叉源:base_branch MUST 记录该分支,该分支 MUST 存在且 MUST NOT 等于新建分支;`--base` 或 `--worktree` 给定时 MUST 豁免「当前在默认分支」门(干净树门保持)。`change start` MUST 支持 `--worktree`:MUST NOT 切换当前检出,而 MUST 在 `sdd.worktree_root`(缺省为仓库根的父目录,相对路径按仓库根解析)下以 `worktree_naming`(id → 分支 `/` 换 `-`;hash → base32(sha256(change_id))[:8];缺省 id)命名的目录创建 worktree 并在其中检出新分支,当前 checkout MUST 保持原分支,输出 MUST 含 worktree 路径;分叉源判定 MUST 依次取 --base 显式 > 当前分支(如实记录,可为非默认分支) > 默认分支解析;分支或 worktree 路径已存在 MUST 报错且零写入;无旗标经典路径行为 MUST 逐字节保持(v1 parity)。`--worktree` 模式下 binding(branch/base_branch/base_sha)MUST 写入新 worktree 内的 proposal.md,发起检出 MUST 字节不变(工作树保持干净);新 worktree 内 proposal 不存在(未提交)MUST 报错,并 MUST 移除已创建的 worktree 与分支。

  @req:r68 @executable
  场景: start --worktree 建树不劫持检出
    假如 一个已提交的临时 git 仓库切到 feature/src 分支且含 change "demo-wt" 的 proposal
    当 对其运行 change start --worktree
    那么 当前检出保持 feature/src
    而且 worktree 目录存在且检出 sdd/demo-wt
    而且 worktree 内 frontmatter 含 branch sdd/demo-wt 且 base_branch 记录 feature/src
    而且 发起检出工作树干净且 proposal 未变

  @req:r68 @executable
  场景: start --worktree 目标路径已存在零写入
    假如 一个已提交的临时 git 仓库切到 feature/src 分支且含 change "demo-wt2" 的 proposal
    当 预先创建其 worktree 目标目录后运行 change start --worktree
    那么 报错含 "worktree path already exists" 且未创建分支 sdd/demo-wt2
    而且 git worktree 条目数不变

  @req:r68 @executable
  场景: start --base 记录显式分叉源
    假如 一个已提交的临时 git 仓库切到 feature/src 分支且含 change "demo-fork" 的 proposal
    当 对其运行 change start --base feature/src
    那么 分支 sdd/demo-fork 被创建且被检出
    而且 frontmatter base_branch 记录 feature/src

  @req:r69 @human
  场景: finalize/archive worktree 感知目标执行
    - `change finalize` 与 `change archive` MUST 在合并前以 `git worktree list --porcelain` 检测目标分支的持有 worktree:目标被其他 worktree 持有且该 worktree 工作树干净时,MUST 以该 worktree 为执行根完成合并、归档改名与收口提交,输出 MUST 含 `executed in target worktree <path>` 执行位置行;持有且工作树脏时 MUST 报错(错误信息 MUST 含该 worktree 路径与处置指引:清理该 worktree 或手动执行合并)且零写入;目标由当前 worktree 自己持有或未被任何 worktree 持有时 MUST 保持现行行为;`--into` 优先序(into > base_branch > 默认分支)与合并语义 MUST 不变。

  @req:r69 @executable
  场景: finalize 目标被干净 worktree 持有时原地执行
    假如 一个目标分支被其他干净 worktree 持有且已完成 start 并有特性提交的临时仓库
    当 对其运行 change finalize
    那么 目标分支获得 archive 提交
    而且 输出含 "executed in target worktree"
    而且 持有 worktree 内完成归档改名与内容合并

  @req:r69 @executable
  场景: finalize 目标被脏 worktree 持有时零写入报错
    假如 一个目标分支被其他脏 worktree 持有且已完成 start 并有特性提交的临时仓库
    当 对其运行 change finalize
    那么 报错含持有 worktree 路径且目标分支无新提交

  @req:r69 @executable
  场景: 目标未被其他 worktree 持有时保持现行行为
    假如 一个已完成 start 并在特性分支有新提交的临时仓库
    当 对其运行 change finalize
    那么 输出不含 "executed in target worktree"
    而且 目标分支获得单条 archive(sdd) 提交

  @req:r81 @human
  场景: 收口合并前执行验收命令
    - 当 change 的 `needs_specs_change` 不为 false,且活规格含至少一个 `@executable` 场景时,`change finalize` 与 `change archive` 在任何合并或改名之前 MUST 处理验收命令:`bdd.run_command` 非空时 MUST 在项目根执行该命令(与 validate 同一条);退出码非 0 或无法启动 MUST 以退出码 1 中止,输出含 `bdd harness failed`,且 MUST 不产生合并与改名。`bdd.run_command` 为空或未配置时 MUST 以退出码 1 中止,输出含 `executable scenarios have no bdd.run_command`,且零写入。环境变量 `LLMAN_SDD_HARNESS_ACTIVE=1` 导致未执行时 MUST 以退出码 1 中止,输出含 `nested invocation`,且零写入;该跳过 MUST NOT 视为通过。`needs_specs_change: false` 时 MUST NOT 要求执行验收命令,也 MUST NOT 因缺少命令而失败。`--no-check` MUST 跳过结构检查与验收命令,且标准错误 MUST 含 `bdd harness skipped: --no-check`。`archive --force` MUST NOT 跳过上述验收判定。没有 `@executable` 场景时 MUST NOT 执行验收命令。

  @req:r81 @executable
  场景: finalize 在合并前跑通验收命令
    假如 一个已完成 start、活规格含 @executable 且 run_command 写标记文件并成功的临时仓库
    当 对其运行 change finalize
    那么 标记文件恰有 1 行
    而且 目标分支获得单条 archive(sdd) 提交

  @req:r81 @executable
  场景: 验收命令失败则不合并不改名
    假如 一个已完成 start、活规格含 @executable 且 run_command 以退出码 1 失败的临时仓库
    当 对其运行 change finalize
    那么 报错含 "bdd harness failed" 且目标分支无新提交
    而且 change 目录未被改名

  @req:r81 @executable
  场景: 有可执行场景但没有验收命令时中止
    假如 一个已完成 start、活规格含 @executable 且未配置 run_command 的临时仓库
    当 对其运行 change finalize
    那么 报错含 "executable scenarios have no bdd.run_command" 且目标分支无新提交
    而且 change 目录未被改名

  @req:r81 @executable
  场景: 声明不改规格时不要求验收命令
    假如 一个已完成 start、needs_specs_change 为 false、活规格含 @executable 且未配置 run_command 的临时仓库
    当 对其运行 change finalize
    那么 目标分支获得单条 archive(sdd) 提交

  @req:r81 @executable
  场景: no-check 写明跳过验收并仍可收口
    假如 一个已完成 start、活规格含 @executable 且 run_command 以退出码 1 失败的临时仓库
    当 运行 change finalize --no-check
    那么 标准错误含 "bdd harness skipped: --no-check"
    而且 目标分支获得单条 archive(sdd) 提交

  @req:r81 @executable
  场景: 嵌套跳过不得当成通过
    假如 一个已完成 start、活规格含 @executable 且 run_command 写标记文件并成功的临时仓库
    当 在设置 LLMAN_SDD_HARNESS_ACTIVE=1 的环境下运行 change finalize
    那么 报错含 "nested invocation" 且目标分支无新提交
    而且 标记文件不存在

  @req:r81 @executable
  场景: archive 同样在合并前执行验收命令
    假如 一个已完成 start、活规格含 @executable 且 run_command 写标记文件并成功的临时仓库
    当 对其运行 change archive
    那么 标记文件恰有 1 行
    而且 目标分支获得单条 archive(sdd) 提交
