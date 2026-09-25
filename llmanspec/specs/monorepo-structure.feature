# language: zh-CN
# capability: monorepo-structure
# purpose: 规范 v2 仓库的 Bun workspaces 布局、oxc 工具链门禁、core 纯域纪律与 BDD runner 就绪要求,并以只读对账断言锁定本地门禁与 CI 的一致性。
# scope: package.json, .bun-version, tsconfig.json, .oxlintrc.json, .oxfmtrc.json, .pre-commit-config.yaml, justfile, .github/workflows/, scripts/, tests/bdd/assert/

功能: monorepo-structure

  @req:r1 @human
  场景: 工作区布局
    - 仓库 MUST 采用 Bun workspaces 单仓布局:根 package.json 声明 workspaces 且 MUST 包含 packages/core 与 apps/cli 两个工作区(包 exports 直指 .ts 源码,core 无构建步骤)。packages/core MUST NOT 依赖任何 apps/* 工作区。.bun-version MUST 存在且 CI MUST 以同一文件钉版(bun-version-file);bun.lock MUST 入库并使用 --frozen-lockfile 安装。

  @req:r2 @human
  场景: 质量门禁
    - justfile MUST 提供 check 聚合门禁(typecheck = tsc --noEmit、oxlint、oxfmt --check 三项全过)与 qa 聚合门禁;qa MUST 依次聚合 check、bun test、golden:check(skills 渲染基线)、pending-gate(待决规则门)与 check:schema(config schema 产物漂移)。根 package.json 的 qa 脚本 MUST 聚合同一集合;CI MUST 运行同一集合,不得多于或少于本地 qa。上述三处一致性 MUST 由只读对账断言锁定,缺项 MUST 逐项报出。pre-commit(prek)MUST 至少包含 oxlint 与 oxfmt --write 两个 local hook,并附带 pre-commit-hooks v5 的 whitespace 系检查。justfile MAY 另含不进入 qa 聚合的配方(如外部剧本 `eval`);该配方 MUST NOT 被 qa 调用。

  @req:r3 @human
  场景: core 纯域纪律
    - packages/core MUST 保持纯域逻辑:文件系统、git 子进程、终端副作用 MUST 经接口(ports)注入,不得在域逻辑内直连;对进程环境(process.* 读取,含环境变量与 pid)与墙钟(无参 Date 构造、Date.now)的访问同属副作用,MUST 经注入或参数传入。纯度门禁 MUST 检出上述全部类别(无过渡白名单条目)。nunjucks 调用 MUST 收敛在 templates/engine.ts,且 MUST 无 loader、autoescape:false;交互提示 MUST 收敛在 PromptDriver 接口之后。oxlint ignorePatterns MUST 忽略生成物与 .agents/skills/。

  @req:r4 @human
  场景: BDD runner 就绪
    - tests/bdd MUST 提供 Gherkin→bun:test 桥接 runner(移植自 crystalith),MUST 支持 zh-CN 关键字(假如/当/那么/而且)与 {param}/{param:d} 占位符语义。config.yaml 的 bdd.run_command MUST 指向 bun test tests/bdd。带 @executable 标签的场景 MUST 可被该 runner 发现并执行。

  @req:r67 @human
  场景: 模板命令对账
    - 模板 skills 与 units(zh-Hans 与 en 双 locale)中对 CLI 命令与旗标的字面引用 MUST 与 CLI 实际命令面对账:引用的命令路径 MUST 存在,引用的每个旗标 MUST 为该命令已注册旗标;对账 MUST 以自动门禁纳入 bun test 套件(随 qa 运行),违例 MUST 致门禁失败并逐条报出来源模板与违例原因。对账面为 packages/core/templates/** 模板源头;渲染产物与 golden 基线为下游,模板字面对账不在下游重复设门(仓库自带产物新鲜度比对是独立门禁,合约在 init-generators r80)。姊妹语义对齐门禁 tests/unit/template-guidance-parity.test.ts(值域/行为陈述,合约在 init-generators r70)与之同随 qa 运行。

  @req:r72 @human
  场景: core 模块依赖对账
    - packages/core/src 顶层模块间的跨模块相对导入 MUST 落在门禁测试内声明的允许边表内(节点为顶层目录与根文件;公共 barrel src/index.ts 豁免;import type 与值导入同权;同模块内部导入不计);新增边 MUST 先在声明表中显式登记并说明理由,收窄(断环/搬移)MUST 同步删表防漂移;对账 MUST 以自动门禁纳入 bun test 套件(随 qa 运行),违例 MUST 逐条报出来源文件与违例边,且声明表中无对应实现的边 MUST 同报(表漂移)。

  @req:r72 @executable
  场景: 模块依赖对账门禁通过
    假如 工作目录是仓库根
    当 执行命令 "bun test tests/unit/module-dependency-parity.test.ts"
    那么 退出码为 0

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
