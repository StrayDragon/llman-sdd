# 命令面

## 收口只留 change archive

技能名 `llman-sdd-archive` 表示实现完成并归档，保持不变。命令跟技能走，所以留下的是 `change archive`，删掉 `change finalize`。

合并后的 `change archive <id>`：

| 旗标 | 来源 | 行为 |
| --- | --- | --- |
| `--into` | 两边都有 | 合并目标，缺省 `base_branch`，再缺省本地默认分支 |
| `--method` | 两边都有 | `squash` 或 `ff`，缺省 `sdd.merge_method`，再缺省 squash |
| `--no-check` | finalize | 跳过合并前的 validate 扫描 |
| `--no-commit` | finalize | 改名后不自动提交 |
| `--dry-run` | change archive | 只打印改名计划，不写 |
| 干净工作区 | change archive | 工作区不干净则拒绝，避免 `git add -A` 卷进无关文件 |

隐藏的 `--force` 删掉。它跳过任务门和 git 门，和收口要表达的「做完了」相反。

## 冷备用顶层 freeze 与 thaw

`archive freeze` 的父命令和收口同名。把父命令改成 `freeze` 之后，冷备是 `llman-sdd freeze`，回置是 `llman-sdd thaw`。旗标（`--before`、`--keep-recent`、`--dry-run`、`--list`、`--ignore-file`、`--change`、`--dest`）不动。

不放进 `change freeze`。`change` 下面的命令都针对一个活跃 change id。冷备按日期挑已经收口的一批目录，打进一个 7z。放在 `change` 下会让 `change archive` 和 `change freeze` 再次并排。

## 绑定只留 change start

| 当前检出 | start 的行为 |
| --- | --- |
| 默认分支，工作区干净 | 创建 `sdd/<id>` 并绑定。今天的 start |
| 其他本地分支，工作区干净，change 尚未绑定 | 绑定当前分支。今天的 attach |
| 已绑定且未给 `--force` | 拒绝，提示已绑定的分支 |
| `--force` | 重绑到当前分支 |
| `--worktree` | 仍在新 worktree 里建分支，不切换当前检出 |
| `--base` | 仍记录分叉源 |

在默认分支上执行「绑定当前分支」会被拒绝，因为那会把 change 绑到默认分支。提示改跑不带既有分支语义的 start，也就是同一条命令在默认分支上的创建路径。

## 脚手架动词

`change new` 建立 change 目录。`spec new` 建立 `.feature`。两件东西不合成一条命令。`spec skeleton` 这个名字删掉，不留别名。
