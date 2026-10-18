# language: zh-CN
# purpose: 界定多实例根并存时四类命名空间的唯一性域与跨根约束(观测、消歧、写入范围)。

功能: scope-boundaries

  @req:r113
  规则: 命名空间唯一性域按实例根
    四类命名空间的唯一性域 MUST 各自锚定单一实例根:req id(`rN`)域以 peripheral-commands r94 为唯一出处(各根注册表独立、跨根不保证唯一);change id 域为当前实例根的 `changes/` 树(含 `changes/archive/<日期>-<id>/` 与叶目录名,门见 validation r87);capability id 域为当前实例根的 `specs/` 目录(跨根同名 capability 合法);非数字 id(change slug、场景名、归档 dated id 的字符串部分)沿用各自既有规则,唯一性域同为实例根。跨根同名或同号 MUST NOT 被视作冲突、MUST NOT 阻断任何命令;仅发现单根时所有行为与输出 MUST 与单根时代逐字节一致。

    场景: 同名 capability 与同号 change 跨根并存不阻断聚合校验
      假如 一个根与子根含同名 capability 与同号 change 的临时仓库
      当 在双根仓库运行 validate --specs --all-roots
      那么 两根的同号 id 各自成立且聚合校验退出码为 0

  @req:r114
  规则: 跨根同号 MUST 可观测且不阻断
    跨根同名或同号 MUST 在聚合校验面可观测:MUST 以「类别(spec|req|change) + 共享值 + 涉及根列表」明细条目与计数汇总的形式出现在 `validate --all-roots` 的聚合报告中;human 形态 MUST 附带指向 `--directory` 的处置指引,machine 形态 MUST NOT 携带该指引行;观测 MUST NOT 改变退出码(仍由各根校验结果决定)。仅发现单根时该观测段 MUST NOT 产出(含空数组);字段名、排序与所在位置等形状细则见 validation r91。

    场景: 跨根同号在聚合报告可观测且不改退出码
      假如 一个根与子根含同名 capability 与同号 change 的临时仓库
      当 分别以 human 与 machine 形态运行 validate --all-roots
      那么 两形态都列出三类撞号明细与计数且 human 尾附 --directory 指引而 machine 不带

    场景: 单根聚合不产出观测段
      假如 一个仅含单根 llmanspec 的临时仓库
      当 在其根运行 validate --all-roots --json
      那么 报告不含 crossRootCollisions 字段

  @req:r115
  规则: 根限定一律经 --directory
    跨实例根消歧 MUST 仅经 cli r109 的 `--directory <path>`;MUST NOT 引入 id 内嵌根限定语法(形如 `<path>#<id>` 或 `<root>:<id>`),任何命令的参数面 MUST NOT 接受或解析此类复合标识符。解析出的实例根 MUST 决定该命令的全部读写目标。

    场景: 读侧命令以 --directory 限定实例根
      假如 一个含根与子根双 llmanspec 的临时仓库
      当 在仓库根以 --directory 指向子根运行 index rebuild 与 context
      那么 索引产物只落在子根实例且根实例无索引目录

    场景: req 注册表按 --directory 限定实例根
      假如 一个含根与子根双 llmanspec 的临时仓库
      而且 子根 specs 存在跨文件同号 req
      当 在仓库根运行 project dedupe-req-ids --dry-run 并限定与不限定 --directory 各一次
      那么 限定子根时报告子根冲突重映射,不限定时报根注册表无冲突

    场景: 复合根限定标识符不被接受
      假如 一个根与子根各含同名 change 的临时仓库
      当 运行 show 复合标识符 与 show 同名 id --directory 子根
      那么 复合标识符报未找到且不解析到子根,--directory 形态解析到子根条目

    场景: 冒号形态复合标识符同样不被任何命令解析
      假如 一个根与子根各含同名 change 的临时仓库
      当 以冒号形态复合标识符分别运行 show 与 validate
      那么 两条命令都报未找到类错误且都不解析到子根条目

    场景: validate 按 --directory 判定被限定实例根的注册表
      假如 一个根与子根含不同 capability 的临时仓库
      当 在仓库根与仓库外分别以 --directory 运行 validate --specs --json
      那么 两次条目都属于被限定的实例根且退出码为 0

    场景: 相对 --directory 与绝对写法等价
      假如 一个根与子根含不同 capability 的临时仓库
      当 以相对与绝对 --directory 各运行一次 validate --all-roots --json 与 list
      那么 两种写法读到同一注册表且相对写法可升到祖先实例根

    场景: show 双输出面在 --directory 下同根判定
      假如 一个子根实例 specs 失效而根实例 specs 有效且子根含 change 的临时仓库
      当 在仓库根分别以 human 与 json 形态运行 show 子根条目 --directory 子根
      那么 两形态的 gate 结论逐项一致且 validate 门按子根注册表判红

  @req:r116
  规则: 写入目标默认限当前实例根
    写入或改写文件的命令,其默认目标 MUST 限于当前解析出的实例根之内,其他实例根的文件 MUST NOT 被隐式改写。两处显式豁免:`init` 及其 `--update` 按发现算子刷新其他实例根的托管块(既有多根写先例);用户显式传入的路径参数(如 `spec migrate-native <paths...>`)按参数原义处理。

    场景: spec 写面只改写命中实例根
      假如 一个含根与子根双 llmanspec 的临时仓库
      而且 子根 specs 存在跨文件同号 req
      当 在仓库根运行 project dedupe-req-ids --directory 子根
      那么 子根注册表被重映射且根实例 llmanspec 树逐字节未变

    场景: change 写面只改写命中实例根
      假如 一个根实例含既有 change 且子根已 start 的临时仓库
      当 在子包源码子目录运行 change new 与 change finalize
      那么 子根产物归位子根且根实例 llmanspec 树逐字节未变

    场景: archive 写面只改写命中实例根
      假如 一个根与子根各含归档 change 的临时仓库
      当 在子包源码子目录运行 archive freeze
      那么 子根归档被冻结且根实例 llmanspec 树逐字节未变

    场景: init --update 跨根刷新托管块属显式豁免
      假如 一个含根实例与子根实例的 git 仓库且两实例托管块均被篡改
      当 在子根运行 init --update
      那么 根实例托管块被跨根刷新属显式豁免

    场景: 显式路径参数按原义处理属显式豁免
      假如 一个含根与子根双 llmanspec 的临时仓库
      而且 根实例 specs 含 legacy 标签式 spec 文件
      当 在子包源码子目录运行 spec migrate-native 指向根实例文件
      那么 该根实例文件按显式路径被迁移且子根实例零写入

  @req:r117
  规则: 路径单一归属门不回归
    MUST NOT 重新引入跨实例根的 `# scope:` 路径单一归属校验:根 `specs/` 的 `# scope:` 命中另一个已存在的实例目录时 MUST NOT 报 ERROR、MUST NOT 使 validate 失败或退出码非零。该判定自 0.8.0 起为报告制观察面而非错误门,重新引入会与 per-root 唯一性域自相矛盾。

    场景: 根 scope 覆盖已带 llmanspec 的子包目录不报错
      假如 一个根 specs scope 指向子包且子包携带 llmanspec 的临时仓库
      当 在双根仓库运行 validate --specs
      那么 越界 scope 只作报告制观察且 validate --specs 仍绿
