# Design: shell-completion

## 入口形态（用户定案:self 组）

`llman-sdd self completion --shell <shell> [--install] [-y]`,前代 parity。
`registerSelf(program, ctx)` 新命令组挂 program.ts(位置注册顺序保持既有
注释约定);本 change 只放 `completion` 一个子命令,`self schema` 等前代
兄弟面不在范围(另案)。组的存在使后续自省类命令有归属位。

## 架构分层(双运行时 + core 纯度)

- **core 纯渲染**:`packages/core/src/self/completion.ts` 输入为命令树 IR
  (`CompletionCommandSpec { name, flags: string[], subcommands: [...] }`),
  按 shell 渲染脚本文本 + 生成/替换 marker 块(纯字符串变换);不 import
  commander(commander 是 CLI 层依赖,core 依赖映射不含它)。
- **CLI 抽取**:`apps/cli` 从 commander program 递归抽取 IR(命令名、
  子命令、长/短旗标、`--directory` 等全局旗标),调 core 渲染打到 stdout。
  命令树变更自动跟进——无第二份命令清单(提案 MUST 条款)。
- **安装**:`apps/cli` 层做 rc 路径解析(bash 回退链 .bashrc → .bash_profile
  → .profile;zsh ~/.zshrc;fish ~/.config/fish/config.fish;powershell
  `$PROFILE` 且 canonicalize 后 MUST 位于 home 内,越界报错;elvish
  ~/.elvish/rc.elv)、交互确认(node:readline,收敛在 CLI 适配层,符合
  AGENTS 交互收敛规约)、`-y` 跳过、非交互未确认 MUST 报错零写入。
- **二进制名**:snippet 与脚本内引用 `llman-sdd`(apps/cli bin 字段,
  常量;前代硬编码 `llman` 同款做法)。

## marker 幂等

start `# >>> llman-sdd completion >>>` / end `# <<< llman-sdd completion <<<`
(前代 marker 为 `llman completion`;本仓命令名是 llman-sdd,marker 跟随
二进制名以避免多工具共居 rc 时混淆——**有意 divergence**,与 snippet 引用
名一致)。重复安装:命中既有块则原位替换,否则追加到文件尾;目标 rc 不存在
时创建(bash 回退链末位保证有落点)。

## 测试 seam(用户定案:双 seam)

- core 单测:IR→五 shell 脚本断言(含子命令/旗标/`--directory`)、marker
  替换/追加/创建三态、rc 回退链。
- BDD(真实 CLI 子进程,HOME 隔离经 `runCli` env 注入临时 HOME):
  - `self completion --shell <each>` stdout 非空且含命令面抽查点
    (`change`/`validate`/`--directory`)。
  - `--install` 写入临时 HOME 的对应 rc 含 marker 块;重复安装幂等(块数
    不增);非交互无 `-y` 报错且 rc 零改动;`-y` 直接写入。
- 前后对比类判据在 change 分支相对 merge-base 测量。

## 性能与零持久化

生成是单次进程内遍历 + 字符串渲染,无 I/O(除读自家命令树对象);安装仅
读写目标 rc 一个文件;不引入任何缓存/状态文件。
