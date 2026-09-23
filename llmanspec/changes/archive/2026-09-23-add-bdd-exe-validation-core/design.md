# Design: BDD executable 化·HIGH 批(validation + change-lifecycle 核心合约)

## 场景清单(6 条 pending 规则 → @executable)

| 规则 | 新验收场景 | 断言核心 |
|---|---|---|
| r11 | 报告行聚合与退出码 | CLI 子进程 `validate --specs --output human`:含种子缺陷 → `FAIL spec/<cap>` 与 `OK spec/<cap>` 行、`Totals: N passed, M failed (K items)` 收尾、退出码 1 |
| r13(重定合约) | check 旗标 no-op 与文案委托 | 同一临时仓库缺省 / `--check` / `--no-check` 三跑退出码与输出字节一致且为 0;`validate --help` 不再宣称执行 `bdd.run_command`、改为指向项目测试套件 |
| r63 | 完整性 WARNING 与脏 specs 警告 | stage=full 已绑定未 landed → WARNING 含 llman-sdd-propose 引导且不建议重跑 change start;默认分支脏 `llmanspec/specs/` → 工作区级 WARNING |
| r64 | proposal frontmatter 非法字段被拒 | 未知字段 `status` → ERROR 含字段名与六合法字段集;改写为六合法字段后退出码 0 |
| r65 | 孤儿验收场景报 WARNING | `validate <spec> --json` 中 WARNING 的 path 为 `<cap>/acceptance/<场景名>` |
| r16(change-lifecycle) | 默认分支解析顺序与皆缺报错 | main+master / 仅 master / origin/HEAD / origin/* 布局矩阵逐一断言 `change start` 写入的 base_branch;四者皆缺报错 |

## Seam 选择

- **CLI 子进程 + mkdtempSync 临时仓库**:六条全是对外可观测合约,统一走 `bun <CLI> …` 子进程,复用 domain.ts 既有 `makeTempRepo`;不做进程内 API 断言。
- **复用 smoke 断言通道**:新 When 步骤把 `{code, stdout: stdout+stderr}` 写入 `fixtures['命令结果']`,直接复用 smoke.ts 的「退出码为 {code:d}」「stdout 符合正则 "{pattern}"」;human 模式的 FAIL/issue 行走 stderr,故合并捕获。
- **r13 no-op 对比**在单个 When 步骤内三次运行后集中断言(退出码 + 字节一致),不新增跨步骤保存 stdout 的接缝。
- **r16 布局矩阵**用参数化 Given(`{layout}` ∈ main+master / master-only / origin-head / origin-branch / none),每相位新建独立临时仓库,`git symbolic-ref`/`update-ref` 造 origin 形态。

## r13 重定合约(委托语义)

- validate 的 `--check/--no-check` 在 action 处理器中零引用(活证),实现从未调用 `bdd.run_command`;本批只收敛合约与文案:`--check/--no-check` 为 v1 表面 no-op,BDD 执行责任在项目测试套件(qa 内 `bun test tests/bdd`)。
- 删除仅测试存活的 `expandRunCommand`/`hasPlaceholders`/`PlaceholderTarget`(changeCheck.ts)及其唯一单测引用段;r48 占位符契约本身不动。
- 模板 8 文件(zh/en × explore/verify/propose/validate)中「跳过耗时的 `bdd.run_command`」类句子改写为委托现实;`init --update` 狗粮重渲染 + `golden:generate` 基线随动。

## 已知偏差(预期)

- `templates/` 改动使 init-generators(scope 覆盖 `packages/core/templates/`、`tests/golden/`)staleness 判 STALE;`validate --all --strict` 将其升级为 ERROR 属既有信号,不修(先例 add-template-command-parity-gate T3,finalize 后 main 上恢复)。review 的 stale 为 warning 级信号,非严格 sweep 退出码仍为 0。
