# language: zh-CN
# purpose: 定义 CLI 全局面合同——错误出口(单一前缀与退出码)、全局旗标面与报告命令输出旗标共享注册。

功能: cli

  @req:r75
  规则: 错误出口单一前缀与退出码
    CLI 的未知命令与未知选项错误 MUST 由统一出口渲染为单一 `Error: ` 前缀(commander 自带的 `error: ` 短前缀 MUST 被剥离,不得出现
    `Error: error:` 双前缀)且 MUST 以退出码 2 退出;域错误 MUST 以 `Error: <message>` 单一前缀渲染且 MUST 以退出码 1 退出;帮助与版本输出
    MUST 保持退出码 0;错误渲染逻辑 MUST 收敛在主入口统一出口,各命令 MUST NOT 自行散落 `process.exitCode = 1` 写退出码点。
    参数解析失败 MUST 一律以退出码 2 退出,口径覆盖缺必需参数、多余参数、非法枚举值与非法旗标组合(前代对 handler 级校验如 `--format`
    以退出码 1 退出,本仓统一为 2,属有意 divergence)。不带子命令的根裸调用(含只给根级选项的情形)MUST 等同 `--help`:帮助文本写
    stdout 且退出码 0;五个纯父分组 `change`/`spec`/`project`/`archive`/`index` 缺必需子命令 MUST 报用法错误到 stderr 且退出码 2;
    `config` MUST 保留其默认 action(裸调用输出概览且退出码 0)。

    场景: 未知命令单一前缀与退出码
      假如 本仓库的真实 llmanspec 工作区
      当 运行 CLI 的未知命令 nosuch
      那么 stderr 以 "Error: unknown command" 开头且不含 "Error: error:"
      而且 退出码为 2


    场景: 域错误单一前缀且退出码 1
      假如 本仓库的真实 llmanspec 工作区
      当 运行 CLI 触发一个域错误(如指向不存在的 change)
      那么 stderr 以 "Error: " 开头且不含 "Error: error:"
      而且 退出码为 1


    场景: 根裸调用等同帮助
      假如 本仓库的真实 llmanspec 工作区
      当 运行 CLI 不带任何子命令与参数
      那么 stdout 含 "Usage: llman-sdd"
      而且 退出码为 0


    场景: 纯父分组缺必需子命令报用法错误
      假如 本仓库的真实 llmanspec 工作区
      当 运行 CLI 的 change 分组不带子命令
      那么 stderr 含 "Usage:"
      而且 退出码为 2


    场景: 缺必需参数退出码为 2
      假如 本仓库的真实 llmanspec 工作区
      当 运行 show 不带 change id 参数
      那么 退出码为 2

  @req:r76
  规则: 报告命令输出旗标共享注册
    报告命令 list/show/validate/review/index check/config skills 的输出旗标 MUST 由共享注册函数统一挂载,旗标面 MUST 一致为
    `--output <toon|json|compact-json|human>`、`--json` 与 `--compact-json` 三个(缺省无输出旗标时输出 TOON);各命令文件
    MUST NOT 自行重复注册 `--output`;`show --output compact-json` MUST 输出可 `JSON.parse` 的单行 JSON,不得回落人读文本。
    共享面 MUST 覆盖 `change next-id`、`change diff` 与 `spec next-req-id`;`--compact-json` MUST 作为 `--json` 的成对修饰符
    解释(`--compact-json` 与 `--output toon|human` 同用 MUST 报用法错误且退出码 2);紧凑输出 MUST 由单点以无缩进
    `JSON.stringify` 生成,MUST NOT 通过删除换行拼装;`--json` 与 `--json --compact-json` 的载荷字节 MUST 与前代一致。
    CLI 配置加载共享入口(loadCliConfig)在检测到 legacy `bdd:` 段被兼容提升为新 `specs:` 语义时 MUST 向 stderr 输出一次
    迁移 WARNING(每进程至多一次、非阻断),内容 MUST 指向 `specs.check_command` 与迁移指引;兼容提升契约见 config-schema r5。

    场景: show compact-json 为真实单行 JSON
      假如 一个含活跃 change 的临时仓库
      当 运行 show 该 change --output compact-json
      那么 输出恰为单行且可被 JSON.parse


    场景: compact-json 与 human 同用报用法错误
      假如 本仓库的真实 llmanspec 工作区
      当 运行 list --compact-json --output human
      那么 退出码为 2


    场景: index check 兼容输出别名可用
      假如 一个含 specs 且已 rebuild 索引的临时仓库
      当 运行 index check --json 与 index check --output compact-json
      那么 两输出均含同载荷 JSON 且 compact-json 为单行


    场景: legacy bdd 配置触发迁移 WARNING
      假如 一个含 legacy bdd 配置的临时仓库
      当 运行 config
      那么 config 标准错误含 "specs.check_command"
      而且 迁移 WARNING 恰好出现一次

  @req:r77
  规则: 全局旗标面
    CLI 全局旗标面 MUST 提供 `--max-scan-depth <N>`(语义见 peripheral-commands r58);前代兼容的无交互效果全局旗标 MUST NOT
    存在,调用之 MUST 得到 commander unknown option 且退出码 2;`config skills` 亦 MUST NOT 提供该兼容旗标(缺省即输出状态)。

    场景: 全局兼容旗标为 unknown option
      假如 本仓库的真实 llmanspec 工作区
      当 运行 CLI 任意命令并附加该兼容旗标
      那么 报 unknown option 且退出码为 2

  @req:r107
  规则: 入口可导入与执行守卫
    CLI 入口 MUST 拆为只构建命令树的工厂(不解析、不执行)与仅负责装配的执行入口,二者 MUST 都能被同进程 import 而不触发任何命令执行;
    执行入口 MUST 以执行守卫判定自身是否为主模块,守卫 MUST 在 `import.meta.main` 不可用时(如 Node 24.0/24.1)回退为比较
    `process.argv[1]` 经真实路径归一后的结果与模块自身路径,该回退比较 MUST 容错路径不可解析的情形;本仓 `engines.node` 声明的
    下界 MUST NOT 因该特性上调。

    场景: 被 import 时不执行命令
      假如 工作目录是仓库根
      当 在子进程中 import CLI 入口模块
      那么 stdout 不含 "Usage: llman-sdd"
      而且 退出码为 0

  @req:r108
  规则: 上下文注入与进程级 cwd 隔离
    CLI MUST 在装配期解析一次运行上下文(终端 IO、git 端口、实例根、工作目录)并注入各命令注册函数;运行时代码 MUST NOT 依赖进程级
    `process.chdir` 改变后续解析基准,命令体 MUST NOT 直接读进程当前目录作为解析起点(缺省起点由上下文承载);同一实例根下改变
    进程工作目录后,MUST NOT 改变任何只读命令的输出。

    场景: 改变进程工作目录不改输出
      假如 一个含活跃 change 与 specs 的临时仓库
      当 分别在该仓库根与其子目录运行 list --json
      那么 两次输出逐字节一致

  @req:r109
  规则: 实例根发现与 --directory 全命令可用
    CLI 全部命令 MUST 经同一根发现算子解析实例根:起点为 `--directory <path>` 所指目录,缺省为进程当前工作目录,自起点向上取最近的
    有效实例(config.yaml 或 specs/ 判定,MUST 复用 validation r91 的有效性判据);`--directory` MUST 对全部命令可用;仅发现单根时
    全部命令输出 MUST 与单根时代逐字节一致;向上未找到有效实例时 MUST 报域错误(消息形如 `no llmanspec root at or above <path>`,
    退出码 1)且 MUST NOT 泄漏底层 `ENOENT` 错误。只读命令(list/show/graph/review/config/index/context)接入根发现属超出前代的
    有意 divergence:前代 `list` 以进程当前目录为根、不做向上发现。写入命令(change/archive/project)MUST 同样经该算子解析:解析
    起点缺省为进程当前工作目录并向上归位最近有效实例,MUST NOT 以 cwd 字面量为实例根、MUST NOT 在无实例处就地新建实例。
    `--directory` 覆盖面有两处显式豁免:`init`(以位置参数 `[path]` 定根)与 `self *`(无实例根语义);豁免之外的全部命令 MUST
    声明并接受 `--directory`,MUST NOT 存在读取该选项却未声明的命令。
    `show` 的 change 面另有一处由本条单根逐字节一致条款推出的宽容面:目标工作区无有效实例但含 `llmanspec/changes/<id>` 时,
    缺省面 MUST 仍按缺省实例目录读出该 change(前代行为),仅当显式传入 `--directory` 时 MUST 报上述域错误。

    场景: 子目录运行只读命令解析到实例根
      假如 一个含活跃 change 与 specs 的临时仓库
      当 在该仓库的子目录运行 list --json
      那么 输出含该 change 且与仓库根运行结果一致

    场景: --directory 对只读命令可用
      假如 一个含活跃 change 与 specs 的临时仓库
      当 在仓库外的临时目录以 --directory 指向该仓库运行 list --json
      那么 输出含该 change 且与仓库根运行结果一致

    场景: 无实例根时报域错误
      假如 一个无任何 llmanspec 实例的空目录
      当 在该目录运行 list
      那么 stderr 含 "no llmanspec root" 且不含 "ENOENT"
      而且 退出码为 1

    场景: show 在无有效实例但含 changes 的工作区保持单根行为
      假如 一个只有 changes 目录而无有效实例判据的临时仓库
      当 在该仓库运行 show 该 change 并在同一目录以 --directory 显式限定
      那么 缺省形态读出该 change 而显式 --directory 形态与 list 都报域错误
