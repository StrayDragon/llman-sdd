# Tasks: simplify-cli-core-and-skills

说明：

- 大范围重构按“先加后删”与依赖排序，不按垂直切片强拆。
- 收口（`change finalize`、`change archive`）是流水线步骤，不在本表。
- T1 须在 `change start` 绑定分支后立即执行。specs 仅可在绑定分支编辑。
- 编辑与验证不得同批并行，验证在编辑落盘后串行。
- 前后对比判据在本 change 分支相对 merge-base 测量。

## 批次 0：止血

- [ ] T1：提交规格
  - 改 `llmanspec/specs/init-generators.feature`。r18 兜底链尾改为内置默认 `zh-Hans`，未知 locale 归一为 `zh-Hans`。r19 删双 locale 基线要求，只留 zh-Hans。r50 内置默认改为 `zh-Hans`。r66、r70、r71 删“双 locale”措辞。r97 删 en 强度词条款。r70 增加两条 MUST：模板加粗标记必须配对、模板示例必须可解析。
  - 改 `llmanspec/specs/config-schema.feature` r6。`locale` 缺省改为 `zh-Hans`。
  - 改 `llmanspec/specs/spec-parsing.feature` r7、r88。locale 归一后 `spec skeleton` 恒产出 zh-CN 方言，删 en 骨架场景。
  - 改 `llmanspec/specs/monorepo-structure.feature`。r3 守护范围加 `apps/cli/src`。r67 模板面不再含 en。
  - 改 `llmanspec/specs/cli.feature`。r75 补退出码口径：缺必需参数、非法枚举值、非法组合一律退出 2。r76 补输出旗标组合语义与紧凑输出定义，并把共享面扩到 `change next-id`、`change diff`、`spec next-req-id`。
  - 改 `llmanspec/specs/change-lifecycle.feature`。r45 与 r79 补收口判据：要求 `specsLanded || !needsSpecsChange`，tasks.md 存在时要求全勾。r99 的 title 读取面扩到 `show` 与 `list`。
  - 改 `llmanspec/specs/review-freeze.feature`。`review` 的在途 change 未勾任务由 critical 降为 warning。
  - 改 `llmanspec/specs/peripheral-commands.feature`。`project migrate` 带范围旗标而无 `action` 时报用法错误。
  - 在本 change 分支提交 specs。

- [ ] T2：修 zh-Hans 模板加粗与语义
  - 恢复 `zh-Hans/skills/{propose,continue,wayfinder,archive,verify,apply,apply-cycle}.md` 的加粗配对，共 8 处。
  - 把全部 `要不得继续` 改为 `是否继续`。

- [ ] T3：补两条门禁断言 [blocked-by: T2]
  - 在 `tests/unit/template-guidance-parity.test.ts` 增加加粗配对断言。扫描围栏外 `**` 计数，奇数报出来源文件与行号。
  - 增加模板示例可解析断言。抽取带 `# language:` 头的围栏块，用 `parseCapability` 试解析。
  - 补单测：人工植入奇数 `**` 与不可解析示例，各自被报出。

- [ ] T4：修 CLI 侧 node-only 并加守护 [blocked-by: T1]
  - 改 `apps/cli/src/cli-shared.ts`。`Bun.spawnSync` 换 `node:child_process.spawnSync`，`exitCode` 断言换 `status`。`import.meta.dir` 换 `import.meta.dirname`。
  - 去掉吞掉 `ReferenceError` 的宽 `catch`，改为显式降级。
  - 新增只读断言扫描 `apps/cli/src/**`，命中 `Bun.` 或非 `dirname` 的 `import.meta.dir` 即失败。
  - 回归：`--version` 的 `+dirty.N` 后缀在 Bun 与 Node 下行为一致。

- [ ] T5：清理死代码残留
  - `cli-shared.ts`：`assertCompactJsonPairing` 改 `void`，保留抛错与退出码 2。
  - `commands/config.ts`：删被下一行覆盖的描述。
  - `commands/archive.ts`：删两处冗余 `catch`。
  - `commands/list.ts`：合并两次 `resolveOutMode`。
  - `scripts/stc-baseline.json`：删 `review-stamp.md` 残留表项。

## 批次 1：模板单线化与适配

- [ ] T6：删 en 树并改 locale 归一与兜底 [blocked-by: T1]
  - 删 `packages/core/templates/en/**` 共 29 个文件，保留 `shared/`。
  - 改 `packages/core/src/templates/locale.ts`。`normalizeLocale` 对空值、zh 前缀、en 前缀、未知值都返回 `zh-Hans`，保留分支形状。`localeFallbacks` 链尾补 `zh-Hans`。
  - 新增常量 `DEFAULT_LOCALE = 'zh-Hans'`。
  - 改 `packages/core/src/spec/parser.ts` 的 `localeToGherkinLang`，先归一。
  - 前进量：模板树文件数由 58 降为 29。

- [ ] T7：默认值单点与资源缺失报错 [blocked-by: T6]
  - 改 `config/schema.ts` 的 `locale` 默认值为 `zh-Hans`。
  - 删 `init/defaultConfig.ts` 的 `DEFAULT_CONFIG_EN`。`writeDefaultConfig` 先归一 locale 再选模板。
  - 把 `commands/spec.ts`、`commands/project.ts`、`progress.ts` 的 `?? 'en'` 换成 `?? DEFAULT_LOCALE`。
  - 改 `commands/init.ts` 的 help 文案为 `built-in default zh-Hans`。
  - 改 `init/init.ts` 的托管块写入。资源缺失由静默跳过改为报错。

- [ ] T8：golden 与渲染门单 locale 化 [blocked-by: T6]
  - 删 `tests/golden/baseline/skills-en/`。
  - 改 `tests/golden/lib.ts`、`generate.ts`、`check.ts`，删 en 变体与 locale 表。

- [ ] T9：测试单 locale 化 [blocked-by: T6, T7, T8]
  - 收 `tests/unit/template-guidance-parity.test.ts` 的 `LOCALES` 为 `['zh-Hans']`。
  - 改写断言 en 行为的用例：`templates.test.ts`、`config.test.ts`、`init.test.ts`。
  - 重写 `tests/bdd/steps/meta-foundation.ts` 的 r18 资源桩，回退目标改为 `zh-Hans`。
  - 改写 `tests/bdd/steps/init.ts` 的 en 分支与对应场景。

- [ ] T10：收敛 ethics 块为单一来源
  - 以 `units/skills/ethics-governance.md` 为唯一来源。
  - 删 `units/skills/structured-protocol.md` 的逐字重复内联块。
  - 评估 `skills/llman-sdd-apply-cycle.md` 的差异值，改为覆写并加注释，或统一引用。
  - 保持 `enforceEthicsGovernance` 的 5 键齐全门全绿。

- [ ] T11：抽取 `index-fallback` 单元
  - 新建 `units/skills/index-fallback.md`，含 index stale 与 chat model 未设双分支。
  - 把 explore、propose、apply、quick 的 4 份复制段改为 `unit()` 引用，并登记 `UNIT_FILES`。

- [ ] T12：合并 git-native-flow [blocked-by: T11]
  - 合并 `git-native-flow` 与 `git-native-flow-brief` 为一个单元，保留繁简两档。
  - 删 brief 单元，改引用处并更新 `UNIT_FILES`。
  - 修“根 AGENTS.md 含全图”的悬空引用。

- [ ] T13：处置死单元与单用单元
  - 接回 `units/spec/feature-contract.md` 的引用，兑现 r71。
  - 把 `units/workflow/archive-freeze-guidance.md` 内联进 `skills/llman-sdd-archive.md`，从 `UNIT_FILES` 移除。

- [ ] T14：删死变量并修 4 处指引
  - 删 `specs_framework` 与 `specs_check_command` 的计算与注入，同步删单测断言与 barrel 再导出。
  - 修 `skills/llman-sdd-apply.md` 的 `config` 报告指引。
  - 补 `skills/llman-sdd-propose.md` 与 `draft.md` 的 frontmatter 枚举，加 `base_branch`。
  - 修 `skills/llman-sdd-validate.md` 的 `morphology` 字段描述。

- [ ] T15：刷新模板面产物与基线 [blocked-by: T2, T9, T10, T11, T12, T13, T14]
  - 在绑定分支运行 `llman-sdd init --update`，重生成 golden 基线。
  - 提交 `.agents/skills/**` 与基线。
  - 跑 `check:skills-template-render`、`check:stc`、`template-command-parity`、`template-guidance-parity`，全绿。

- [ ] T16：新增迁移与 CHANGELOG [blocked-by: T6]
  - 新增 `migrations/v0.9-v0.10/README.md`，写破坏面与升级步骤。
  - 在 `packages/core/src/project/migrations.ts` 增加版本项。
  - 在 `CHANGELOG.md` 增加破坏性条目。

## 批次 2：CLI 结构

- [ ] T17：抽出 createProgram 工厂
  - 新增 `apps/cli/src/program.ts`，导出 `createProgram(ctx)`，保持注册顺序。
  - `main.ts` 加 `if (import.meta.main)` 守卫。
  - 改 `apps/cli/package.json` 的 `exports`。
  - 改 `tests/unit/removed-surface.test.ts` 为调用工厂，删注册顺序复刻。

- [ ] T18：抽出 emitReport 输出管线
  - 在 `cli-shared.ts` 增加 `emitReport(value, opts, humanFn?)`。
  - 迁移 `config`、`index`、`spec`、`review`、`list`、`validate`。
  - 删 `show.ts` 的自建 token 解析，改为复用，保留其 `outputHint`。
  - 回归：旗标面、缺省 TOON、`show --output compact-json` 单行可解析都不变。

- [ ] T19：收敛选项与 specs 根解析
  - 抽 `addSpecDirOption(cmd)`，消除 6 处 `--directory` 重复声明。
  - 抽 `withSpecRoot(dir, fn)`，统一三处分叉。

- [ ] T20：拆分 validate action
  - 把 `validate.ts:291-535` 提取为 `runAllRoots`、`resolveRootArg`、`runSingleItem`、`runBulk`。

- [ ] T21：注入 CliContext [blocked-by: T17, T18, T19, T20]
  - 引入 `CliContext { io, git, root, cwd }`，由 `main` 解析一次并注入。
  - 替换 16 处 `makeCliGit(process.cwd())` 与 39 处 `process.cwd()`。
  - 删 `validate.ts` 的 `process.chdir` 与配套 `try/finally`。
  - 回归：集成测试与临时仓库 harness 场景全绿。

## 批次 3：core 去重

- [ ] T22：depends_on 一处解析、两种策略 [blocked-by: T1]
  - 新增 `readDeps(text, mode)`。用 `extractFrontmatter` 切块，用 `yaml.parseDocument` 取值。
  - 宽松模式供 graph：缺失、非法、解析失败都返回 `[]`，非字符串项丢弃，绝不抛。
  - 严格模式供 validate：非列表报“must be a list of change ID strings”；每项未命中活跃 change、归档目录或平铺卡时报 `references unknown change: <id>`。
  - 裸 `depends_on:` 按空列表处理。
  - 冻结卡写入改用宽松解析加归一化 flow。
  - 删三份手写解析。
  - 补单测锁定引号、多行流式、冒号前空格、数字项四类输入。

- [ ] T23：收敛 active-change 遍历
  - 收编到 `change/collect.ts` 的 `walkActiveChangeDirs`。
  - 改 `report/graph/nodes.ts` 的两份为调用。

- [ ] T24：收敛 .feature 发现 [blocked-by: T23]
  - 收编到 `validation/discover.ts`。
  - 改 `report/specHelpers.ts` 与 `context/tree.ts` 为调用，统一排序与路径规范化。
  - 回归：核对 spec hash 稳定，`index check` 不误报新鲜度。

- [ ] T25：收敛正则与比较器
  - dated-archive id 正则 4 变体收敛为单点。
  - semver 比较 2 份收敛为单点。

- [ ] T26：收敛 IO port
  - 引入 `interface FsPort`，各模块用 `Pick` 收窄，替换 18 个同构接口。
  - 收窄 `change/resolve.ts`，不再要求 `mtimeMs`。
  - 回归：不引入任何 `node:fs`、`process` 或墙钟。

- [ ] T27：收敛常量并清死导出
  - 复用 `CHANGES_DIR`，新增 `SPECS_DIR`，清 3 处路径字面量。
  - 删零消费者导出与 `validateCapability` 的死 `_io` 形参。
  - barrel 补 `specsLanded` 导出，测试改走 barrel。
  - 前进量：barrel 标识符数相对 merge-base 下降。

- [ ] T28：破 config 与 templates 模块环 [blocked-by: T26]
  - 下沉 `SddConfig` 类型或 locale 依赖，断开一条边。
  - 收缩 `module-dependency-parity` 的允许边表，跑该门为绿。

- [ ] T29：收敛局部重复
  - 合并 `validation/changeCheck.ts` 的两处 pattern gate。
  - 提取 `change/lifecycle.ts` 的 close-out 门错误构造。
  - 改 `review/review.ts` 为复用 `collectUnboundRequirements`。

## 批次 4：命令面口径收敛

- [ ] T30：统一输出旗标组合语义 [blocked-by: T18]
  - 新增单点 `renderMachine(value, mode)`。`compact-json` 用 `JSON.stringify(value)`，不带缩进。
  - 删 `commands/list.ts` 的 `text.replaceAll('\n','')`，改由单点按 mode 渲染。
  - `--compact-json` 与 `--output toon|human` 同用时报用法错误，退出 2。
  - 把 `--compact-json` 的成对约束写入 help 文案。
  - 补矩阵测试：7 个报告命令乘 5 种旗标组合，断言行数与可解析性。
  - 回归：`--json` 与 `--json --compact-json` 的载荷字节不变。

- [ ] T31：补全退出码口径
  - 在 `main.ts` 统一出口把用法错误归到退出 2。
  - 经 `exitOverride` 改写 commander 的 `missingArgument` 默认退出 1。
  - 修 `invalid --type`、`invalid --stage`、`invalid --sort` 的退出码。
  - 补用法错误矩阵测试，逐项断言 1 与 2 的归属。

- [ ] T32：三个命令接入共享输出面
  - `commands/change.ts` 的 `next-id` 与 `diff`、`commands/spec.ts` 的 `next-req-id` 改用 `addReportOutputOptions`。
  - 回归：`--json` 载荷字节不变。

- [ ] T33：show 与 list 回显权威 title
  - 新增 `changeTitle(proposal)`，frontmatter `title` 优先，`firstH1` 回退。
  - 改 `packages/core/src/change/collect.ts` 与 `packages/core/src/report/show.ts` 的 title 取值。
  - 回归：title 缺失时回退 H1 的行为不变。

- [ ] T34：收口复用 readyToImplement 判据
  - 抽出 `closeOutGate(change)`，复用 `specs-landed` 与 `tasks-done` 判据。
  - 收口要求 `specsLanded || !needsSpecsChange`；tasks.md 存在时要求全勾。
  - `change finalize` 与 `change archive` 在合并前调用该门，失败零写入。
  - 改 `show.ts` 的 `tasksHint`，tasks.md 缺失时不再提示“complete or check off remaining tasks”。
  - 补场景测试：合约未改而收口被拒；迷你 change 收口通过。

- [ ] T35：review 未勾任务降级
  - `validate` 信号的未勾任务落 `warningCount`，不计 `criticalCount`。
  - 回归：`locked` 与 `unbound` 信号不变。

- [ ] T36：project migrate 范围旗标校验
  - 出现 `--from-version`、`--to-version`、`--kind` 而无 `action` 时报用法错误，退出 2。
  - 错误消息列出 `prompt` 与 `strip-legacy-headers` 两个合法 `action`。

- [ ] T37：收口细节
  - `change diff` 空 diff 输出一行提示。
  - 组命令空调用按定论统一退出码，并把该行为写入 spec。
  - `change archive` 与 `archive freeze/thaw` 的 help 互相交叉指引。
  - `assertCompactJsonPairing` 的布尔返回改 `void`。

## 验证

- [ ] T38：全量验收 [blocked-by: T3, T4, T5, T15, T16, T21, T22, T24, T25, T26, T27, T28, T29, T30, T31, T32, T33, T34, T35, T36, T37]
  - 在 change 分支跑 `just qa`，全绿。
  - 跑 `llman-sdd validate --all --strict --check`，通过。
  - 记录前后对比证据：重复代码数、死导出数、模板复制份数、测试用例数。全部相对 merge-base 测量。
