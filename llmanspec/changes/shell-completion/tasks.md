# Tasks: shell-completion

测试 seam(用户定案:双 seam)——core 纯函数单测 + 既有 Gherkin→bun:test
runner(`tests/bdd/`,真实 CLI 子进程,HOME 隔离经 runCli env 注入)。

- [ ] t1 生成路径(打穿 core 渲染 → CLI 抽取 → self completion 命令面)
  - core:`packages/core/src/self/completion.ts` 定义 `CompletionCommandSpec`
    IR + 五 shell 脚本渲染(子命令与旗标两层,含全局旗标);CLI:
    commander 树递归抽取 IR + `registerSelf` 组与 `self completion`
    `--shell <bash|zsh|fish|powershell|elvish>` 生成路径(stdout)。
  - specs:新建 `specs/completion.feature`(skeleton + add-req/add-scenario),
    生成路径条款(五 shell 值域、动态推导、stdout 合同、树变更自动跟进)
    与可执行场景。
  - 单测:IR 渲染断言(各 shell 含 change/validate 子命令与 --directory/
    报告旗标抽查点);BDD:五 shell 逐一 stdout 非空且含抽查点。
  - 验证:`bun test tests/unit/<相关>` → `bun test tests/bdd -t "completion"`。

- [ ] t2 安装路径(marker 幂等 + rc 链 + 确认门,与 t1 可并行)
  - core:marker 块替换/追加/创建三态纯函数;CLI:rc 路径解析(bash 回退
    链、powershell `$PROFILE` 越 home 报错)、交互确认(node:readline)、
    `-y` 跳过、非交互未确认报错零写入。
  - specs:安装条款(marker 幂等、rc 回退链、确认门)与可执行场景。
  - 单测:marker 三态 + bash 回退链;BDD(HOME 注入临时目录):install 写入
    对应 rc 含 marker、重复安装块数不增、非交互无 -y 报错且 rc 零改动、
    -y 直接写入。
  - 验证:`bun test tests/unit/<相关>` → `bun test tests/bdd -t "install"`。

- [ ] t3 全局面收敛与收口验证([blocked-by: t1, t2])
  - `self completion --help` 旗标面与 specs 一致;`--directory` 与报告类
    旗标在补全内容中与命令面收敛结果一致(抽查断言补进单测)。
  - 验证:`just qa` + `llman-sdd validate --check --strict` 全绿;前后对比
    在 change 分支相对 merge-base 测量。
