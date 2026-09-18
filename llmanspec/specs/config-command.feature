# language: zh-CN
# capability: config-command
# purpose: 定义 `config` 命令面的只读概览与 extra_skills 非交互管理合同。
# scope: apps/cli/src/, packages/core/src/config/

功能: config-command

  @req:r37 @human
  场景: config 只读概览
    - `config`(无子命令)MUST 只读输出 llmanspec/config.yaml 概览,内容 MUST 覆盖 schema/locale/extra_skills(启用数与总数)/bdd(开或关)/archive 五要素;config 缺失或非法 MUST 报错且退出码非零;本命令 MUST NOT 修改任何文件。

  @req:r38 @human
  场景: config skills 非交互管理
    - `config skills`(默认/`--no-interactive`)MUST 打印当前启用集与可用全集(v1 文本形态);`--json` MUST 输出 {enabled, available},available MUST 为六枚举(llman-sdd-continue/llman-sdd-ff/llman-sdd-validate/llman-sdd-arch-review/llman-sdd-wayfinder/llman-sdd-research);`--set`/`--unset` MUST NOT 存在于 flag 面(未知选项按 v1 语义 rc=2 报错,不产生任何写回)。

  @req:r37 @executable
  场景: config 概览只读
    假如 一个带注释与 extra_skills 的 llmanspec config
    当 运行 v2 的 config 概览
    那么 概览五要素输出且文件未被修改

  @req:r38 @executable
  场景: skills 非交互管理
    假如 一个带注释与 extra_skills 的 llmanspec config
    当 运行 v2 的 config skills --json
    那么 JSON 输出 {enabled, available} 且 --set 为未知选项
