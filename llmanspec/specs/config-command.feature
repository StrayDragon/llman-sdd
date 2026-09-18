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
    - `config skills` MUST 默认列出当前启用集与可用全集;`--json` MUST 输出 {enabled, available},available MUST 为六枚举(llman-sdd-continue/llman-sdd-ff/llman-sdd-validate/llman-sdd-arch-review/llman-sdd-wayfinder/llman-sdd-research);`--set <name>` 与 `--unset <name>`(均可重复)MUST 以注释保留方式增删 extra_skills 后写回,MUST 保留 $schema 头行与全部用户注释;白名单外名字 MUST 报错且不产生写回。

  @req:r37 @executable
  场景: config 概览只读
    假如 一个带注释与 extra_skills 的 llmanspec config
    当 运行 v2 的 config 概览
    那么 概览五要素输出且文件未被修改

  @req:r38 @executable
  场景: skills 非交互管理
    假如 一个带注释与 extra_skills 的 llmanspec config
    当 运行 v2 的 config skills --set 与 --unset
    那么 启用集更新且注释与 schema 头保留
