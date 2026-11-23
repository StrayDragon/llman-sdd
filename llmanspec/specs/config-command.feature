# language: zh-CN
# purpose: 定义 `config` 命令面的只读概览。技能安装由 init --update 完成。

功能: config-command

  @req:r37
  规则: config 只读概览
    `config`(无子命令)MUST 只读输出 llmanspec/config.yaml 概览,内容 MUST 覆盖
    schema/locale/specs(开或关,含经旧 bdd 兼容提升)/archive 四要素;config 缺失或非法 MUST 报错且退出码非零;本命令 MUST NOT
    修改任何文件。

    场景: config 概览只读
      假如 一个带注释与 extra_skills 的 llmanspec config
      当 运行 config 概览
      那么 概览四要素输出且文件未被修改

  @req:r38
  规则: config 不提供 skills 子命令
    `config skills` MUST NOT 存在。调用它 MUST 以未知命令失败,退出码为 2,且 MUST NOT 修改 config.yaml。

    场景: config skills 不是命令
      假如 一个带注释与 extra_skills 的 llmanspec config
      当 运行 config skills
      那么 退出码为 2 且 config 文件未被修改
