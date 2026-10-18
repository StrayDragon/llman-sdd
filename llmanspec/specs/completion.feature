# language: zh-CN
# purpose: 定义 self completion 补全命令的生成、安装与确认门合同——五类 shell、marker 幂等、非交互零静默写入。

功能: completion

  @req:r110
  规则: 生成路径——五 shell 动态推导
    「self completion」MUST 支持五类 shell 值域(bash、zsh、fish、powershell、elvish),集外值 MUST 报错并列出合法值域且退出码非零;缺省生成路径 MUST 将补全脚本写到 stdout,内容 MUST 从 commander 命令树动态推导——覆盖子命令与旗标两层,含 --directory 与报告类全局旗标,MUST NOT 维护第二份命令清单,命令树变更后补全内容自动跟进;脚本文本中的命令引用 MUST 使用 bin 名 llman-sdd。

    场景: 五 shell 逐一生成非空脚本
      假如 一个已初始化的 llman-sdd 命令面
      当 逐一运行 self completion --shell bash 与 zsh 与 fish 与 powershell 与 elvish
      那么 各 shell 输出非空脚本且含 change 与 validate 子命令和 --directory 旗标

    场景: 未知 shell 值域拒绝
      假如 一个已初始化的 llman-sdd 命令面
      当 运行 self completion --shell nushell
      那么 报错列出合法值域且退出码非零

    场景: 补全内容与命令树同源
      假如 一个已初始化的 llman-sdd 命令面
      当 运行 self completion --shell bash
      那么 输出覆盖 commander 树全部顶级命令与各自长旗标

  @req:r111
  规则: 安装路径——marker 幂等与 rc 链
    「self completion --install」MUST 将补全 snippet 写入目标 shell 的 rc/profile 并以 marker 块(# >>> llman-sdd completion >>> 与 # <<< llman-sdd completion <<<)包裹;重复安装 MUST 按 marker 幂等原位替换且块数不增;目标 rc 缺失时 MUST 创建;bash MUST 依次取 .bashrc、.bash_profile、.profile 回退;zsh 取 ~/.zshrc;fish 取 ~/.config/fish/config.fish;powershell 取 $PROFILE 且解析后 MUST 位于 home 内,越界 MUST 报错且零写入;elvish 取 ~/.elvish/rc.elv;snippet 与脚本内命令引用 MUST 使用 bin 名 llman-sdd。


    场景: install 写入对应 rc 且含 marker
      假如 一个 HOME 指向临时目录的运行环境
      当 运行 self completion --shell bash --install -y
      那么 临时 HOME 的 .bashrc 含完整 marker 块

    场景: 重复安装幂等
      假如 一个已完成一次 install 的临时 HOME
      当 再次运行 self completion --shell bash --install -y
      那么 marker 块数仍为一且内容为最新

    场景: bash rc 回退链
      假如 一个 HOME 下仅存在 .bash_profile 的环境
      当 运行 self completion --shell bash --install -y
      那么 marker 块写入 .bash_profile

    场景: powershell profile 越出 home 报错
      假如 一个 PROFILE 指向 home 之外的环境
      当 运行 self completion --shell powershell --install -y
      那么 报错且零写入

  @req:r112
  规则: 确认门——非交互零静默写入
    「self completion --install」MUST 在写入 rc 前取得确认:交互环境 MUST 提示目标路径并等待确认;显式 -y MUST 跳过确认直接写入;非交互(无 TTY)且未给 -y 时 MUST 报错且 MUST NOT 写入任何文件——静默写入 MUST NOT 发生。


    场景: 非交互未确认报错零写入
      假如 一个非交互且 rc 已存在的 HOME
      当 运行 self completion --shell bash --install
      那么 报错且 rc 内容字节不变

    场景: 交互确认 y 写入
      假如 一个对确认提示应答 y 的交互运行环境
      当 运行 self completion --shell bash --install
      那么 rc 含完整 marker 块
