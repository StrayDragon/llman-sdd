# language: zh-CN
# capability: monorepo-structure
# purpose: 规范 v2 仓库的 Bun workspaces 布局、oxc 工具链门禁、core 纯域纪律与 BDD runner 就绪要求,作为后续全部 port-* change 的可验证地基。
# scope: package.json, .bun-version, tsconfig.json, .oxlintrc.json, .oxfmtrc.json, .pre-commit-config.yaml, justfile, packages/, apps/, tests/

功能: monorepo-structure

  @req:r1 @human
  场景: 工作区布局
    - 仓库 MUST 采用 Bun workspaces 单仓布局:根 package.json 声明 workspaces 且 MUST 包含 packages/core 与 apps/cli 两个工作区(包 exports 直指 .ts 源码,core 无构建步骤)。packages/core MUST NOT 依赖任何 apps/* 工作区。.bun-version MUST 存在且 CI MUST 以同一文件钉版(bun-version-file);bun.lock MUST 入库并使用 --frozen-lockfile 安装。

  @req:r2 @human
  场景: 质量门禁
    - justfile MUST 提供 check 聚合门禁(typecheck = tsc --noEmit、oxlint、oxfmt --check 三项全过)与 qa 聚合门禁(check + bun test)。pre-commit(prek)MUST 至少包含 oxlint 与 oxfmt --write 两个 local hook,并附带 pre-commit-hooks v5 的 whitespace 系检查。

  @req:r3 @human
  场景: core 纯域纪律
    - packages/core MUST 保持纯域逻辑:文件系统、git 子进程、终端副作用 MUST 经接口(ports)注入,不得在域逻辑内直连。模板引擎调用 MUST 收敛在 TemplateEngine 适配器之后;交互提示 MUST 收敛在 PromptDriver 接口之后。oxlint ignorePatterns MUST 忽略生成物与 .agents/skills/。

  @req:r4 @human
  场景: BDD runner 就绪
    - tests/bdd MUST 提供 Gherkin→bun:test 桥接 runner(移植自 crystalith),MUST 支持 zh-CN 关键字(假如/当/那么/而且)与 {param}/{param:d} 占位符语义。config.yaml 的 bdd.run_command MUST 指向 bun test tests/bdd。带 @executable 标签的场景 MUST 可被该 runner 发现并执行。

  @req:r67 @human
  场景: 模板命令对账
    - 模板 skills 与 units(zh-Hans 与 en 双 locale)中对 CLI 命令与旗标的字面引用 MUST 与 CLI 实际命令面对账:引用的命令路径 MUST 存在,引用的每个旗标 MUST 为该命令已注册旗标;对账 MUST 以自动门禁纳入 bun test 套件(随 qa 运行),违例 MUST 致门禁失败并逐条报出来源模板与违例原因。对账面为 packages/core/templates/** 模板源头;渲染产物与 golden 基线为下游,不重复设门。

  @req:r67 @executable
  场景: 模板命令对账门禁通过
    假如 工作目录是仓库根
    当 执行命令 "bun test tests/unit/template-command-parity.test.ts"
    那么 退出码为 0

  @req:r1 @executable
  场景: 工作区布局合约对账通过
    假如 工作目录是仓库根
    当 执行命令 "bun tests/bdd/assert/monorepo-layout.ts"
    那么 退出码为 0

  @req:r2 @executable
  场景: 质量门禁合约对账通过
    假如 工作目录是仓库根
    当 执行命令 "bun tests/bdd/assert/quality-gates.ts"
    那么 退出码为 0

  @req:r3 @executable
  场景: core 纯域纪律合约对账通过
    假如 工作目录是仓库根
    当 执行命令 "bun tests/bdd/assert/core-purity.ts"
    那么 退出码为 0

  @req:r4 @executable
  场景: BDD runner 就绪合约对账通过
    假如 工作目录是仓库根
    当 执行命令 "bun tests/bdd/assert/bdd-runner.ts"
    那么 退出码为 0
