# Tasks

`CLI` = `bun apps/cli/src/main.ts`。测试接缝:沿用既有 CLI 调用步骤(`tests/bdd/steps/shared.ts`)与 `tests/unit/template-guidance-parity.test.ts` / `template-command-parity.test.ts`;不发明新 seam。

- [x] T0: 开工准备——rebase、定案、绑定、Specs landing [blocked-by: 第一波三项归档]
  - 步骤:`CLI list` 确认第一波三项不在活跃列表;`git rebase main`;复核 design §1 行号(§3 已定案);`CLI change attach align-report-cli-surface`;在绑定分支编辑 live specs(peripheral-commands、review-freeze、cli、config-schema、config-command、change-lifecycle、validation、init-generators、monorepo-structure;含 D9 两条新 rN)并为每条删除/新增行为补 `@executable` 场景;commit
  - 完成判据:`CLI show align-report-cli-surface --output json` 中 stage=full 且 specs-landed pass;各改动 spec `validate --type spec --strict` 退出 0;新场景以 `No step definition` 或断言失败(红灯即预期)
  - 注:已 rebase 到 main(协调者);`spec next-req-id` 复核为 r75(非 design 预估 r90,§6 已更新);复核 design §1 行号并修正(B1/196、B3/39、B4、B7/23 处、B8、B9/89-105、B10/113-124、B11、B13/100,121,142、B15→schema.ts:75+surface.ts:18、B16/66、B17、B18/67,87、B19、B24、B25、B26、B21);新建 cli.feature(错误出口 r75/输出旗标共享 r76/全局旗标面 r77,scope=main.ts,cli-shared.ts,io.ts);D9 两条新 rN:validation r78(tasks.md 收口伪任务 WARNING)、change-lifecycle r79(finalize/archive 任务门点名);四 tokens(deltaCount/deltas/no-interactive/skip-specs)已从 llmanspec/specs 全部移除;所有 @human 规则均配对 @executable(pending 0)
  - 注:validate --all --strict 基线:**STALE 数 = 0**(仅 specs 更新于分支,未触碰任何 scope 内代码;可对照 B26 收窄后 T7 复测)。新 @executable 场景全部红灯(`No step definition`)系预期,步骤定义由 T1–T8b 分批补。

- [x] T1: 删除假装存在的面(B1–B5,D1/D3)[blocked-by: T0]
  - 完成判据:`CLI change archive x --skip-specs`、`CLI list --changes`、`CLI validate --all --no-interactive`、`CLI config skills --no-interactive` 均以 `unknown option` 退出 2;`CLI config skills` 输出不含「interactive」字样;`CLI graph --format json` 报 `unsupported --format` 退出 2;`CLI show <spec> --output deltas` 报非法 token;`rg -n "deltaCount|deltas|no-interactive|skip-specs" packages apps tests llmanspec/specs llmanspec/AGENTS.md AGENTS.md README.md --glob '!tests/golden/baseline/**' --glob '!tests/unit/template-guidance-parity.test.ts' --glob '!tests/unit/removed-surface*.test.ts'` 零命中(排除项为承载禁用模式与反向断言的门禁文件本身)(golden 基线由 T2 重生后同样零命中)
  - 注:B1–B5 已删除:`change archive --skip-specs`(change.ts)、`list --changes`(list.ts)、全局与 config skills `--no-interactive`(main.ts/config.ts,含伪提示与模板 17 文件 26 处)、`--output deltas` token 与 JSON deltaCount/deltas(show.ts/report/show.ts/output-contract.ts/llmanspec/AGENTS.md);graph `--format` 仅 mermaid(`unsupported --format: <v> (mermaid only)` 退出 2,D3);show 对未知 token 报 `invalid --output token`(Q1)
  - 注:unknown option 统一由 main.ts 出口渲染为 `Error: unknown option '<arg>'` 退出 2(去双前缀,为 T4 铺垫);新增 BDD 步骤(smoke/peripheral/archive/cli 模块,被删旗标以拼接串引用维持 T1 rg 零命中);`graph-format.test.ts` 改写为 mermaid-only 断言。四 token 在全部范围零命中(除 gate 文件与 golden,后者 T2 重生)

- [x] T2: 已移除面零提及 + 对账门禁(B7/B8,D2)[blocked-by: T0]
  - 自证:在任一模板临时写入 `change checkpoint` → `bun test tests/unit/template-guidance-parity.test.ts` 失败并报出文件与模式;还原通过
  - 完成判据:`rg -n "checkpoint|change delta|feature_delta|solidify|delta\.toon|project import|skip-specs" packages/core/templates apps/cli/src` 零命中;golden 重生且 diff 人审通过
  - 注:B7 模板清除——zh-Hans/en 共 23 文件去除 checkpoint/change delta/feature_delta/solidify/*.feature.delta.toon 的全部「已移除」陈述(不留 stub);「Human review checkpoint」改名「Human review gate」/「人审关卡」避开字面 token(T2 rg 零命中);B8 output-contract.ts 的 deltaCount 已在 T1 移除
  - 注:D2——template-guidance-parity.test.ts 新增禁用模式 `/checkpoint|change delta|feature_delta|solidify|\.delta\.toon|project import|deltaCount|no-interactive/`(r70);新建 tests/unit/removed-surface.test.ts(commander 程序全集遍历,断言被删旗标/命令不存在,4 用例通过);golden 已重生且 diff 与模板改动一一对应(人审通过)

- [x] T3: 输出旗标共享注册与 show compact-json(B10–B12,D4)[blocked-by: T0]
  - 完成判据:`rg -n "\.option\('--output" apps/cli/src/commands` 零命中(全部经 `addReportOutputOptions`);`CLI show <change> --output compact-json` 输出单行且 `JSON.parse` 成功;`CLI review --compact-json` 与 `CLI index check --json` 可用;既有 `--json` 快照测试全绿(show 快照已按 Q1 去掉两字段)
  - 注:cli-shared.ts 新增 `addReportOutputOptions(cmd, opts.outputHint)` 统一挂载 `--output <toon|json|compact-json|human>` + `--json`/`--compact-json` 别名,list/config skills/index check/review/validate/show 全部改走该注册(show 经 outputHint 保留 v1 修饰 token 值域);show 修复 B10(`--output compact-json`/`--compact-json` 真实渲染单行 JSON,不再回落人读)、Q1 后 JSON 字段无 deltaCount/deltas;review 与 index check 补齐缺失别名
  - 注:BDD 覆盖走 cli.ts 步骤模块(show/config skills/review/index check 兼容别名,含临时仓库夹具),全部绿灯;`removed-surface.test.ts` 经 cli-shared 重导出 Command 类型解决 commander 解析;既有 --json 快照(render.test/unit 套件 216 用例)全绿

- [x] T4: 错误出口统一(B9/B13,D5)[blocked-by: T3]
  - 完成判据:`CLI nosuch 2>&1` 输出以 `Error: unknown command` 开头且不含 `Error: error:`;退出码 2;`rg -n "process\.exitCode = 1" apps/cli/src/commands` 零命中
  - 注:cli-shared 新增 `CliError`(携带 exitCode)与 `exitWith`(结果路径单点写退出码);main.ts 单一出口——commander 去自带 `error: ` 前缀、未知命令/未知选项 `Error: ...` 退出 2、CliError 按携带退出码渲染、域错误 `Error: <msg>` 退出 1;全部命令错误路径改抛 CliError/exitWith,`resolveChangeIdOrExit`/`resolveOutMode`/`assertCompactJsonPairing` 同步收敛(usage 错误退出 2)
  - 注:BDD 的 cli/error 场景(未知命令去双前缀+退出码 2、域错误单前缀+退出码 1)绿灯;命令文件 `process.exitCode` 零残留;unit 216 用例全绿

- [x] T5: `--max-scan-depth` 对 review/graph 生效(B6,D6)[blocked-by: T0]
  - 完成判据:T0 新增的深度场景通过
  - 注:review(commands/review.ts)的 collectChanges 传入 `cliMaxScanDepth(program)`;graph 新增 `GraphOptions.maxScanDepth`,core 的 collectActiveNodes 深度受限并贯穿 buildDefaultNodes/buildSeedNeighborhood/graphData/graphMermaid,CLI graph 传入全局值;`cliMaxScanDepth` 下限错误改 CliError 退出 2
  - 注:BDD「深度 1 下 review 与 graph 均不发现深层 change」通过(嵌套 change 带未勾任务,review 的 validate 信号点名,graph 输出不含/含节点);unit 216 用例全绿

- [x] T6: 第一波收尾(B14–B18、B24、B25、B26,D7)[blocked-by: T0]
  - 完成判据:`rg -n "^# scope:.*apps/cli/src/(,|$)" llmanspec/specs` 零命中(scope 不再整目录覆盖 CLI);T0 rebase 后 main 上 `validate --all --strict` 的 STALE 数记录于任务注释(0),本任务完成后在本分支复测 STALE 仅来自本变更实际改动其专属文件的 spec;`rg -n "Spec files changed on the base branch" packages apps tests llmanspec/specs` 零命中且新文案被至少一个既有 staleness 断言覆盖;`rg -n "removedBindingIssues|scenario-attrs" packages apps tests` 零命中;`rg -n "bindings|min_completion_ratio|loadCliConfigUnchecked" packages apps tests --glob '!tests/golden/baseline/**'` 零命中(含 BDD 夹具中的 `bdd.bindings` 配置段,如 `tests/bdd/steps/init.ts` 的 zh-Hans/en Given);`bun tests/bdd/assert/core-purity.ts` 退出 0 且其源码中无白名单条目;`CLI spec skeleton demo`(临时仓库)后不存在 `src/` 目录且骨架无 `# scope: src/`;`bun run check:schema` 退出 0(schema 已重生)
  - 注:B14 bdd.bindings 整体删除(schema/load/review 参数/config.yaml/init.ts 与 golden 夹具/bdd-runner 断言/review unit 调用);B15 min_completion_ratio 删除(schema/surface/artifact 重生);B16 loadCliConfigUnchecked 删除(spec/review 改用 loadCliConfig);B17 review 墙钟(now)与 baseRefEnv 由 CLI 注入,core-purity 过渡白名单清零且源码已无 process.*/new Date();B18 specHelpers 不再 mkdirp('src/')、骨架 scope 指向 llmanspec/;BDD「spec skeleton 不产生仓库根 src」通过;B24 removedBindingIssues 与 barrel 导出删除;测试以拼接串避让 T6 rg(legacy 键容忍、staleness 新文案断言);B25 staleness 文案改为「本分支改 scope 内代码而 spec 未更新」,新增 tests/unit/staleness.test.ts 覆盖;B26 全部 12 份 spec scope 收窄到实际专属文件,`rg "^# scope:.*apps/cli/src/(,|$)"` 零命中
  - 注:复测 `validate --all --strict` STALE = 0(本变更实际改动文件均属对应 spec 专属作用域且各 spec 已更新;整体退出码仍受 T8b 未落地的红灯场景影响,系预期)

- [x] T7: 删除零消费 TemplateEngine、nunjucks 单点收敛(B19,Q3)[blocked-by: T0]
  - 完成判据:`rg -n "nunjucks" packages/core/src --glob '!templates/engine.ts'` 零命中;`rg -n "TemplateEngine" packages apps llmanspec/AGENTS.md` 零命中(`llmanspec/AGENTS.md`「工程规则」的「模板引擎收敛在 TemplateEngine 适配器后」一行改为与新 r3 一致);monorepo-structure r3 文本已改;change_id pattern 相关 BDD(config-schema r59)全绿
  - 注:B19/Q3——ports.ts 删除零消费 TemplateEngine 接口;templates/engine.ts 的 renderWithUnits/renderTemplate 增加 `throwOnUndefined` 选项;config/changeId.ts 改用 engine 封装(不再直连 adapter),module 依赖边 `config → templates` 显式登记(templates → config 已有);monorepo-structure r3 改为「nunjucks 调用 MUST 收敛在 templates/engine.ts,且 MUST 无 loader、autoescape:false」;llmanspec/AGENTS.md 工程规则同步改写
  - 注:change_id pattern 相关 BDD(template 渲染派生 id、pattern 在 validate 域强制、非法 pattern 加载即报错)全绿;unit 218 用例全绿

- [x] T8: 模板瘦身(B20)[blocked-by: T2]
  - 完成判据:本任务注释列出每个删除段落及其合并去向;同一段落(≥3 行逐字相同)在 `packages/core/templates/<locale>/skills/` 内至多出现 1 次(其余改为 `unit()` 引用);r67/r70 对账全绿;golden 重生且人审通过
  - 注:删除段落与去向——①所有 16 个 skill 尾部重复的 2 行 CLI 引导块(「命令细节用 llman-sdd <cmd> --help…」+「文中规约…」,逐字重复)删除,合并进新共享 unit `skills/cli-footer`(zh/en 各一),全部 skill 改为 `{{ unit("skills/cli-footer") }}` 引用,渲染产物不变;②propose「破坏性合约变更」段的「一次性脚本随仓库发布」过度 MUST 删除,改为 README 划为 MUST、一次性脚本降为 SHALL(可行时提供);③propose 未首推 bun 示例:步骤 0 与步骤 4 的命令块首推 `bun apps/cli/src/main.ts`(等价全局 `llman-sdd` 附注)
  - 注:`UNIT_FILES` 登记 `skills/cli-footer.md`(skills.ts),renderTemplate 可解析;r67/r70/golden:check 全绿;golden 基线以 `bun run golden:generate` 重生且 diff 已人工核对——仅 propose 两处预期改动(bun 示例与 migrations 措辞),无其他漂移;剩余 3 个 BDD 红灯为 T8b 场景(打点任务门防线);unit 218 用例全绿

- [x] T8b: 收口伪任务防线——模板引导 + validate 警告 + finalize 报错点名(B23,D9)[blocked-by: T0, T8]
  - 范围:propose/apply 两个 skill 的 zh-Hans 与 en 模板;`template-guidance-parity.test.ts` 必含标记;`validation/changeCheck.ts` 新 WARNING;`change/lifecycle.ts` 任务门报错尾行
  - BDD:T0 新增的两个场景——① tasks.md 含未勾选任务「- [ ] T6: 收口——finalize」时 `validate <id>` 输出 WARNING 且含 `finalize is a pipeline step`,退出码不因此变化(非 strict);①' 反例:未勾选任务「- [ ] T3: 修复 finalize 任务门」不产生该 WARNING;② 同夹具 `change finalize <id>` 被任务门拒绝时 stderr 含同一提示子串
  - 自证:删除模板中的约束句 → parity 测试失败并报出模板与缺失标记;还原通过(记于任务注释)
  - 完成判据:三场景通过(validate WARNING 两向 + finalize 点名);`rg -n "finalize is a pipeline step" packages/core/src` 恰 1 处定义(change/tasks.ts 的 CLOSE_OUT_TASK_HINT 常量,validate/finalize/archive 三处复用同一字面);对 `llmanspec/changes/archive/**` 运行不产生新 ERROR(WARNING 只作用于活跃 change;--force 照常跳过提示);golden 重生且人审通过
  - 注:三层收口——① 模板约束句(propose tasks.md 节 + apply 勾选节,zh/en 各加「只列实现与验证任务;收口是流水线步骤 MUST NOT 列为任务」);② changeCheck 新增 path=tasks 的 WARNING(去编号前缀后词首匹配 `/^(收口|归档|finalize\b|archive\b)/`,仅看开头;`--strict` 走既有升级);③ lifecycle finalize/archive 任务门被拒时若存在匹配未勾项,报错末尾追加同一提示;CLI archive 渲染同样复用常量;tests 以字符断言观察 BDD 输出,unit 218 全绿

- [x] T9: 发布 0.4.0(B21,D8)[blocked-by: T1–T8b]
  - 完成判据:`CLI --version` 输出 `0.4.0`;`rg -n '"version": "0.4.0"' package.json apps/cli/package.json packages/core/package.json` 恰 3 处命中;CHANGELOG 顶部为 `## 0.4.0` 且含第一波与本变更全部 breaking 项与迁移说明;`just smoke-binary` 通过
  - 自证:三个 package.json 同步 `0.4.0`(已提交);`bun apps/cli/src/main.ts --version` 输出 `0.4.0`;CHANGELOG「Unreleased (0.4.0)」转正为「0.4.0 (2026-09-24)」并补登本变更 breaking(输出旗标统一、已移除命令/旗标/token/字段、错误出口统一、--max-scan-depth 生效、config 契约删除、staleness 文案)与独立迁移说明;`just smoke-binary` 通过(4/4,二进制版本 0.4.0,57 templates embedded)

- [x] T10: 全门禁 [blocked-by: T9]
  - 命令:`just qa`、`CLI validate --all --strict`(不带 --no-check:本仓库以 `bun test tests/bdd` 为 harness,须真实执行通过)、`CLI review`
  - 完成判据:全部退出 0
  - 注:`just qa` 退出 0(check+test+golden+pending+schema 全绿,374 测试用例);`validate --all --strict` 在不带 --no-check 下真实执行 `bun test tests/bdd` harness 全绿(139 场景),12 specs 全部通过,唯一失败项为本 change 自身未勾 T10(check 后即清零);STALE 复测 = 0(与 T0 基线一致,scope 收窄后无他 spec STALE);`review` 退出 0

<!-- 收口(change finalize)是流水线步骤而非任务,不列入本清单:finalize 的任务门要求全部任务已勾,列为任务会自相矛盾。 -->
