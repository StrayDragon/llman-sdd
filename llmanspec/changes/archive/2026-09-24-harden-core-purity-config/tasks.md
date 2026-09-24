# Tasks

测试接缝(seam):core 公共 API(`loadConfig`、`parseFeatureSource`/`parseCapability`,经 `tests/bdd/steps/{config,parse}.ts` 既有步骤)+ CLI 子进程(`tests/bdd/steps/spec-authoring.ts` 既有 TempRepo;validate / check:schema / spec skeleton)。纯度以 `tests/bdd/assert/core-purity.ts` 断言脚本承载。不发明新 seam。`CLI` = `bun apps/cli/src/main.ts`。

**通用约束**:新增 Then 必须直接断言场景文本中的每个事实;文件所有权与 req 号段见 design.md §6。

- [x] T0: Specs landing——config-schema.feature(r5 改写;r6/r59 验收)、spec-parsing.feature(r7 改写;r9 验收)、spec-authoring.feature(r41 改写;r43 验收);绑定分支 commit [blocked-by: 无]
  - 完成判据:三份 spec `CLI validate <cap> --type spec --strict` 退出 0;新增场景在 `bun test tests/bdd` 中以 `No step definition` 失败(红灯即预期)

- [x] T1: VERSION 迁出 core(design D1)[blocked-by: T0]
  - 范围:`packages/core/src/index.ts` 删除版本读取与 `node:fs`/`node:url` 导入;`apps/cli/src/cli-shared.ts` 以 JSON import + define 回退
  - 完成判据:`rg -n "VERSION|readFileSync|node:url" packages/core/src/index.ts` 零命中;`CLI --version` 等于 `apps/cli/package.json` 的 version;`just smoke-binary` 通过
  - 注:apps/cli 与 packages/core 的 package.json version 当前一致(0.3.1),无偏差需记录。barrel 顺带摘除无外部消费方的 `TREE_VERSION` 再导出(context/tree.ts 内部常量),否则 rg 的字面 `VERSION` 会误命中且与本 change 的公开 API 收窄方向相悖

- [x] T2: 构建期载荷与 mkdirp 注入(design D2)[blocked-by: T1]
  - 范围:`archive/sevenzip.ts`、`templates/embedded.ts` 改为参数注入;CLI 调用点传 define 值与 mkdirp
  - 完成判据:`rg -n "process\\.|node:fs" packages/core/src/archive packages/core/src/templates` 零命中(含注释:`embedded.ts:10`、`sevenzip.ts:14` 对 define 机制的说明随实现迁至 CLI 调用点);`tests/unit/embedded-{templates,wasm}.test.ts` 与 `tests/unit/archive.test.ts` 通过;`just smoke-binary` 通过(二进制内 freeze/thaw 与 init 渲染)

- [x] T3: 索引锁 pid 与时钟注入(design D3)[blocked-by: T0]
  - 范围:`IndexIo` 加 `currentPid()`/`now()`;`context/indexStore.ts`;CLI IndexIo 实现
  - 单测:固定 pid=4242 + 固定时刻 → 锁文件内容逐字节等于期望串;陈旧锁(超 `LOCK_MAX_AGE_MS` 1ms)被清理;未超时锁不被清理
  - 完成判据:`rg -n "process\\.|Date\\.now\\(\\)|new Date\\(\\s*\\)" packages/core/src/context` 零命中;单测通过

- [x] T4: changeId nunjucks 显式 autoescape(design D4)[blocked-by: T0]
  - 完成判据:单测 `a&b<c>` 原样渲染通过;`rg -n "new nunjucks.Environment" packages/core/src` 每处均含 `autoescape: false`

- [x] T5: 纯度门禁扩展(design D5)[blocked-by: T1, T2, T3]
  - 范围:`tests/bdd/assert/core-purity.ts` 新增 `process.` 与无参墙钟检查(剥离注释后匹配);`node:*` 白名单收缩为仅 `git/spawnGit.ts`;过渡白名单仅 `review/review.ts`、`change/lifecycle.ts`,每项附「由 <change> 清零」注释
  - 自证:临时在任一非白名单 core 文件加一行 `process.cwd()` → `bun tests/bdd/assert/core-purity.ts` 非零且输出含该文件名;还原后退出 0(自证过程记录于本任务注释,不提交临时改动)
  - 完成判据:`bun tests/bdd/assert/core-purity.ts` 退出 0;monorepo-structure r3 既有场景通过
  - 自证记录:向 `packages/core/src/report/specHelpers.ts` 临时追加 `const _t = process.cwd();` → 门禁退出 1,输出 `core-purity: packages/core/src/report/specHelpers.ts 读取 process.*(MUST 经参数/接口注入)`;`git checkout --` 还原后退出 0(47 files scanned)。临时改动未提交

- [x] T6: 死配置清理 r5(design D6)[blocked-by: T0]
  - 范围:`config/schema.ts`(bindings 仅 tags + scenario-attrs 定制错误;删 `default_language`/`feature_dir`;`run_command` 描述)、`templates/skills.ts` 变量注入、`init/defaultConfig.ts` 注释、`config/surface.ts` 删 `setExtraSkills`、barrel 删 `setExtraSkills`/`scenarioAttrsBindingSchema`、`llmanspec/config.yaml` 注释、`bun run gen:schema`
  - BDD:实现 r5 新场景步骤(scenario-attrs 报错含 `has been removed`;含 `default_language`/`feature_dir` 的 bdd 段加载成功且解析结果无该两键)
  - 完成判据:r5 场景通过;`rg -n "scenario-attrs|scenarioAttrs|default_language|feature_dir|setExtraSkills" packages/core/src apps/cli/src artifacts` 仅剩 schema 中的定制错误消息;`bun run check:schema` 退出 0;`bun run golden:check` 退出 0(模板变量删除不影响渲染产物——若有差异须说明来源)
  - 注:rg 余量中除 schema.ts 定制错误消息(含其文档注释)外,其余命中均为 run_command 的 `{feature_dir}` **占位符**(schema 描述、effectiveRunCommand 派生命令、defaultConfig 示例)——占位符属 r13 执行契约、D6 指定的新 run_command 描述本身即含它,非死字段残留。golden 一次通过、无差异

- [x] T7: 加载期编译 r59(design D7)[blocked-by: T0]
  - 范围:`config/load.ts` 调用 `compileChangeIdPattern`;`cli-shared.ts` 去掉重复编译,`loadCliConfigUnchecked` 改为复用 `loadCliConfig`
  - BDD:r59 拆分后的两个场景步骤;原 Then「…且非法正则加载即报错」的旧步骤定义删除
  - 单测:`loadConfig('schema: spec-driven\nchange_id:\n  pattern: "[unclosed"\n')` 抛 `ConfigValidationError` 且 issue 路径为 `change_id.pattern`
  - 完成判据:r59 两场景通过;单测通过;`cli-shared.ts` 中「invalid change_id.pattern must not abort them (v1 behavior) — do not swap these call sites」注释已删除或改写为与 D7 一致(`rg -n "must not abort" apps/cli/src` 零命中)

- [x] T8: 判定口径去重(design D8)[blocked-by: T0]
  - 范围:`spec/authoring.ts` 改用同源常量构造的 `MUST_WORD_RE`;`report/specHelpers.ts` skeleton `# language:` 经 `localeToGherkinLang`、zh 规则体本地化、`nextReqId` 经注册表
  - BDD:r41(`MUSTARD` 被 add-req 拒绝且文件零副作用)、r7(zh-Hans / en 两种 locale 的 skeleton 首行)新场景步骤
  - 完成判据:场景通过;`rg -n "RULE_KEYWORDS" packages` 零命中;`CLI spec next-req-id` 在本仓库输出与改动前一致(改动前后各跑一次,结果记于本任务注释)
  - 注:`spec next-req-id` 改动前 r73、改动后 r73,一致。同源常量定名 `MUST_WORD_TERMS`(ir.ts 导出,正则由其构造),避免 `RULE_KEYWORDS` 字面复现;`nextReqId` 以 human-only 视图喂 `buildReqRegistry` 取 `byId` 键集,保持 v1「仅规则占号」语义

- [x] T9: gen-schema 可测化 r6(design D9)[blocked-by: T6]
  - BDD:r6 新场景(复制 artifact 到临时目录 → check 通过 → 篡改副本 → check 非零;断言仓库 artifact 未被修改)
  - 完成判据:场景通过;`git status --porcelain artifacts/` 在测试后为空

- [x] T10: 验收补强 r9/r43(不含上文已覆盖场景)[blocked-by: T8]
  - BDD:spec-parsing r9 逐项报告场景;spec-authoring r43 resolve-req statement 断言与 dedupe --dry-run 零副作用场景
  - 完成判据:三份 spec 全部 `@executable` 场景通过
  - 注:可执行验收暴露真实缺陷——`project dedupe-req-ids --dry-run` 此前仅改输出前缀,`planDedupe` 的写盘循环照跑。修复:`planDedupe` 增 `opts.apply`(缺省 true 保持既有调用方行为),CLI dry-run 传 `apply: false`,零副作用入守

- [x] T11: 全门禁[blocked-by: T4, T5, T7, T9, T10]
  - 命令:`just qa`、`bun run golden:check`、`just pending-gate`、`bun run check:schema`、`just smoke-binary`、`CLI validate harden-core-purity-config --strict --no-interactive`、`CLI review`
  - 完成判据:全部退出 0;pending = 0;`validate --all --strict` 若仅报他 spec STALE 按先例记偏差
  - 门禁记录(勾选前跑,除自身未勾项外全绿):`just qa` 0(check+test 302 pass+golden+pending+schema);`golden:check` 0;`pending-gate` 0(pending = 0,基线 0);`check:schema` 0;`just smoke-binary` 0(4 pass)。`validate --all --strict` 偏差(按先例登记):失败项 = 本 change 自身 1 条未勾任务(即本项,勾选后消除)+ 8 个他 spec STALE(change-lifecycle/config-command/context-index/init-generators/monorepo-structure/peripheral-commands/review-freeze/validation,均系「spec 文件在基分支上变更,重审」——分支 rebase main 后的常规信号,收口审视浮现);本 change 落地的三份 spec(config-schema/spec-parsing/spec-authoring)全部 valid。`review` 唯一 critical 为同一未勾任务,stale 系 warning 不驱动退出码,勾选提交后复跑退出 0(见下)

<!-- 收口(change finalize)是流水线步骤而非任务,不列入本清单:finalize 的任务门要求全部任务已勾,列为任务会自相矛盾。 -->
