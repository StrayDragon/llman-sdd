# language: zh-CN
# capability: cli
# purpose: 定义 CLI 全局面合同——错误出口(单一前缀与退出码)、全局旗标面与报告命令输出旗标共享注册。
# scope: apps/cli/src/main.ts, apps/cli/src/cli-shared.ts, apps/cli/src/io.ts

功能: cli

  @req:r75 @human
  场景: 错误出口单一前缀与退出码
    - CLI 的未知命令与未知选项错误 MUST 由统一出口渲染为单一 `Error: ` 前缀(commander 自带的 `error: ` 短前缀 MUST 被剥离,不得出现 `Error: error:` 双前缀)且 MUST 以退出码 2 退出;域错误 MUST 以 `Error: <message>` 单一前缀渲染且 MUST 以退出码 1 退出;帮助与版本输出 MUST 保持退出码 0;错误渲染逻辑 MUST 收敛在主入口统一出口,各命令 MUST NOT 自行散落 `process.exitCode = 1` 写退出码点。

  @req:r75 @executable
  场景: 未知命令单一前缀与退出码
    假如 本仓库的真实 llmanspec 工作区
    当 运行 CLI 的未知命令 nosuch
    那么 stderr 以 "Error: unknown command" 开头且不含 "Error: error:"
    而且 退出码为 2

  @req:r75 @executable
  场景: 域错误单一前缀且退出码 1
    假如 本仓库的真实 llmanspec 工作区
    当 运行 CLI 触发一个域错误(如指向不存在的 change)
    那么 stderr 以 "Error: " 开头且不含 "Error: error:"
    而且 退出码为 1

  @req:r76 @human
  场景: 报告命令输出旗标共享注册
    - 报告命令 list/show/validate/review/index check/config skills 的输出旗标 MUST 由共享注册函数统一挂载,旗标面 MUST 一致为 `--output <toon|json|compact-json|human>`、`--json` 与 `--compact-json` 三个(缺省无输出旗标时输出 TOON);各命令文件 MUST NOT 自行重复注册 `--output`;`show --output compact-json` MUST 输出可 `JSON.parse` 的单行 JSON,不得回落人读文本。

  @req:r76 @executable
  场景: show compact-json 为真实单行 JSON
    假如 一个含活跃 change 的临时仓库
    当 运行 show 该 change --output compact-json
    那么 输出恰为单行且可被 JSON.parse

  @req:r76 @executable
  场景: index check 兼容输出别名可用
    假如 一个含 specs 且已 rebuild 索引的临时仓库
    当 运行 index check --json 与 index check --output compact-json
    那么 两输出均含同载荷 JSON 且 compact-json 为单行

  @req:r77 @human
  场景: 全局旗标面
    - CLI 全局旗标面 MUST 提供 `--max-scan-depth <N>`(语义见 peripheral-commands r58);v1 兼容的无交互效果全局旗标 MUST NOT 存在,调用之 MUST 得到 commander unknown option 且退出码 2;`config skills` 亦 MUST NOT 提供该兼容旗标(缺省即输出状态)。

  @req:r77 @executable
  场景: 全局兼容旗标为 unknown option
    假如 本仓库的真实 llmanspec 工作区
    当 运行 CLI 任意命令并附加该兼容旗标
    那么 报 unknown option 且退出码为 2
