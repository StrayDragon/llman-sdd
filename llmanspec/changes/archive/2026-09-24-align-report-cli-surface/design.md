# Design: 报告面与 CLI 命令面对齐、残留面彻底清除与 0.4.0 发布

> **人读摘要**
> - **结论**:对外表面有 3 类问题——假装存在的旗标/字段、已移除命令的模板残留、输出模式不对称;另有第一波登记的 6 项收尾。原则:**命令面 = specs = 模板陈述**,多余的一律删除,不留 stub。
> - **风险**:① 删除旗标/字段是 breaking,须随 0.4.0 集中登记;② 模板改动触发 golden 重生,须人审 diff;③ 与第一波所有步骤文件相交,必须在第一波全部归档后开工。
> - **待决策**:无(§3 四项已于 2026-09-24 由用户定案)。

> 证据行号已由 T0 基于 main@a02eff1(第一波归档后)复核更新。

---

## 1. 问题清单(证据)

### 1.1 假装存在的面

| # | 位置 | 现状 |
|---|---|---|
| B1 | `apps/cli/src/commands/change.ts:196` | `--skip-specs`「legacy flag accepted for v1 parity (no longer merges deltas)」,无任何效果 |
| B2 | `apps/cli/src/commands/list.ts:23` | `--changes`「v1 explicit scope flag; default」,无效果 |
| B3 | `apps/cli/src/main.ts:39`、`commands/config.ts:22,44`、`llmanspec/specs/config-command.feature`、模板 26 处 | 全局 `--no-interactive`「accepted for v1 parity」无效果;`config skills` 打印「Run without --no-interactive to edit interactively」但无交互选择器 |
| B4 | `commands/show.ts:98,114-119`、`packages/core/src/report/show.ts:133-134`、spec peripheral-commands r53/r21 | `--output deltas` token 与 JSON 常量 `deltaCount: 0`、`deltas: []`——delta 机制已移除 |
| B5 | `commands/graph.ts:11` | `--format <format>` 缺省 mermaid,接受任意值;用户定案:仅 mermaid |
| B6 | `apps/cli/src/main.ts:33`、spec peripheral-commands「--max-scan-depth … list/show/validate --all/review/graph 统一生效」 | review 与 graph 未读取该值 |

### 1.2 已移除命令的残留

| # | 位置 | 现状 |
|---|---|---|
| B7 | `packages/core/templates/{zh-Hans,en}/**` 23 处(`rg -n "checkpoint\|change delta\|feature_delta\|solidify\|delta\.toon" packages/core/templates`) | 反复声明「已移除」;apply/git-native-flow-brief 声称「调用即以非零退出报错,指向 finalize」为假 |
| B8 | `tests/bdd/steps/output-contract.ts:186` | 仍把 `deltaCount` 当作契约字段 |
| B9 | `apps/cli/src/main.ts:89-105` | commander 错误 `error: unknown command 'x'` 被再加 `Error: ` 前缀 → `Error: error: unknown command` |

### 1.3 输出模式不对称

| # | 位置 | 现状 |
|---|---|---|
| B10 | `commands/show.ts:113-124` | `--output compact-json` 回落人读文本 |
| B11 | `commands/review.ts:31`、`commands/index.ts:27` | review 无 `--compact-json`、index check 无 `--json` 别名 |
| B12 | list/validate/review/index/config/show 各自 `.option('--output …')` | 同一组旗标与描述重复 6 处,值域描述已漂移 |
| B13 | `apps/cli/src/cli-shared.ts:100,121,142` 与各命令 `process.exitCode = 1` 散落 | 错误输出与退出码各自处理,前缀/流向不统一 |

### 1.4 第一波登记的收尾

| # | 来源 | 内容 |
|---|---|---|
| B14 | harden-core-purity-config 待决策 | `bdd.bindings` 整体删除(review 已不消费):schema、`commands/review.ts:36,51`、`review.ts` bindings 参数;review「unbound」保持 r23 孤儿 @req 语义(已定案) |
| B15 | fix-lifecycle-validation-defects D8b | `archive.min_completion_ratio` schema 字段删除(`schema.ts:75` 与 `surface.ts:18` 的引用一并删除);`commands/change.ts` 的读取已在第一波删除 |
| B16 | harden-core-purity-config D7 | 删除 `loadCliConfigUnchecked`(`cli-shared.ts:66`;调用方 change/review/spec) |
| B17 | harden-core-purity-config D5 | 纯度过渡白名单清零:`review/review.ts:94,204` 的 `process.env`/`new Date()` 改注入;(`change/lifecycle.ts` 条目已在 A review 时删除,本项只剩 review.ts);monorepo-structure r3 去掉「过渡白名单」措辞 |
| B18 | 审计 | `report/specHelpers.ts` `scaffoldSpec` 调 `io.mkdirp('src/')`(line 87)且骨架写 `# scope: src/`(line 67,仓库根空 `src/` 根因);peripheral-commands r22 |
| B19 | 审计 | TemplateEngine port:monorepo-structure r3 要求「模板引擎调用 MUST 收敛在 TemplateEngine 适配器之后」;现状 `ports.ts:18` 声明了 `TemplateEngine` 接口但全仓零实现、零消费;`templates/engine.ts` 以普通函数 `renderTemplate` 封装 nunjucks,`config/changeId.ts:7,53` 绕过它直接 `new nunjucks.Environment` |

### 1.5 模板与发布

| # | 内容 |
|---|---|
| B20 | git-native 段落在 apply/archive/propose/validate/apply-cycle 重复;migrations 段对脚本写「MUST」过度;propose 未首推 bun 示例 |
| B21 | `package.json` 0.3.1 vs CHANGELOG「Unreleased (0.4.0)」 |
| B24 | C 审阅(2026-09-24) | C 新增的 `removedBindingIssues`(`config/schema.ts:31`、`config/load.ts:12,42`,scenario-attrs 定制报错)进入了 core barrel,唯一消费方是 `config/load.ts`;bindings 整体删除(B14)后该函数、其 barrel 导出与 `load.ts` 预检一并删除,不另留「bindings 已移除」stub(嵌套未知键由 zod 剥离) |
| B25 | C 审阅(2026-09-24) | `validation/staleness.ts:146` STALE 文案 `Spec files changed on the base branch; re-review the spec.` 与判定语义相反——实际判定是「本分支改动了 scope 内代码而 spec 未更新」(`touchedPaths.length > 0 && !specUpdated`,基准为 merge-base);读者会误以为基分支动了 spec。改为 `Code in this spec's scope changed on this branch but the spec was not updated; re-review the spec.`;`--json` 中该 message 字段随之变化(0.4.0 breaking 条目登记) |
| B26 | 第一波三个 change 均须为「他 spec STALE」记偏差 | 11 份 spec 中 8 份的 `# scope:` 含整个 `apps/cli/src/`,monorepo-structure 更含 `packages/`、`apps/`、`tests/` 全树;任何 CLI 或 core 改动都会把它们全部标 STALE,`validate --all --strict` 在每个 change 上必红,信号失效、偏差注释成惯例。scope 收窄到各 capability 真正拥有的文件:CLI 部分精确到 `apps/cli/src/commands/<cmd>.ts` 及专属适配器(如 validation → `commands/validate.ts`、`harness.ts`);`cli-shared.ts`/`main.ts`/`io.ts` 归新 `cli` capability;monorepo-structure 只保留根配置文件、`.github/workflows/`、`scripts/`、`tests/bdd/assert/` |
| B23 | D 实施中暴露(2026-09-24) | tasks.md 中的「收口——finalize」任务与 finalize/archive 任务门自相矛盾(`lifecycle.ts` finalize 先过 `archiveTaskGate`):勾选即虚报、不勾则收口被拒、实施期 `validate --strict` 永红。4 个归档 change 带此写法,后来者照抄;模板未写明禁止,工具也不提示。项目规则已由 align-docs-and-gates 写入 `llmanspec/AGENTS.md`,本变更补模板与机器防线 |
| B22 | 测试 helper 分散(`tests/bdd/steps/shared.ts` 与各步骤文件重复的 tmp repo / git 初始化)——**不在本变更**,见 Q4 |

## 2. 决策(已定案)

- **D1 删除原则**:已移除/无效果的命令、旗标、输出 token、JSON 字段、schema 字段 MUST 从代码、specs、模板、项目文档(`llmanspec/AGENTS.md` 托管块外,其「不移植」条现列有 `deltas` 修饰符;根 `AGENTS.md`、`README.md`)四处同时删除;不保留兼容桩、不保留「已移除」陈述。调用被删旗标得到 commander 原生 `unknown option` 错误。
- **D2 残留对账门禁**:扩展 init-generators r70 的 `tests/unit/template-guidance-parity.test.ts`:禁用模式 `/\bcheckpoint\b|change delta|feature_delta|solidify|\.delta\.toon|project import|--skip-specs|--no-interactive/u` 对 `packages/core/templates/**` 零命中;另新增 `tests/unit/removed-surface.test.ts`:构建 commander 程序后遍历全部命令的已注册旗标,断言被删旗标(`--skip-specs`、`--changes`@list、`--no-interactive`)与被删命令(`change checkpoint`、`change delta`、`project import`)均不存在。
- **D3 graph**:`--format` 仅接受 `mermaid`,其他值报错 `unsupported --format: <v> (mermaid only)` 退出 2;保留旗标以便未来扩展(缺省 mermaid)。
- **D4 输出旗标共享注册**:`cli-shared.ts` 新增 `addReportOutputOptions(cmd)`,统一挂载 `--output <toon|json|compact-json|human>`、`--json`、`--compact-json`;所有报告命令(list/show/validate/review/index check/config skills)使用;`show --output compact-json` 真实输出单行 JSON。
- **D5 错误出口**:`main.ts` 统一出口——commander 错误去掉其自带 `error: ` 前缀后加单一 `Error: `;域错误同前缀;退出码:用法错误 2、域错误 1。各命令内 `console.error + process.exitCode` 改为抛出带退出码的错误类型,由统一出口处理。
- **D6 `--max-scan-depth`**:review 与 graph 读取全局值并传入 core 扫描函数;新增可执行场景:深度 1 下 review/graph 均不发现 2 层深的 change。
- **D7 第一波收尾**:B14–B18、B24、B25、B26 按表执行;review 墙钟与环境变量改为参数(`now: Date`、`env` 映射)由 CLI 注入。
- **D9 收口伪任务防线(B23)**:三层,前人栽树:
  - 模板:propose「写 tasks.md」一节与 apply「勾选」一节(zh-Hans + en)加约束句——tasks.md 只列实现与验证任务;收口(`change finalize`/`change archive`)是流水线步骤,MUST NOT 列为任务(二者的任务门要求全部任务已勾)。`template-guidance-parity.test.ts` 以必含标记锁定两个 locale。
  - validate:change 域新增 WARNING(path `tasks`):未勾选任务标题(去掉 `T<n>[a-z]?:` 编号前缀后)**以收口动词开头**——匹配 `/^(收口|归档|finalize\b|archive\b)/iu`——时报(只看开头,避免误伤「修复 finalize 任务门」这类以收口为对象的正当任务) `task "<标题>" looks like a close-out step; finalize is a pipeline step — remove it from tasks.md (finalize/archive require every task checked)`;只作用于活跃 change,不回溯归档;strict 下随 WARNING 升级规则。
  - finalize/archive 任务门:被拒且未勾项中存在上述匹配时,报错追加同一提示(文案常量单一定义)。
  - 规格:validation.feature 与 change-lifecycle.feature 各新增一条 rN(r90 起,T0 分配)。
- **D8 发布**:三个 `package.json`(根、`apps/cli`、`packages/core`,现均为 0.3.1)版本同步为 0.4.0;CHANGELOG「Unreleased (0.4.0)」改为「0.4.0 — <date>」,补登第一波与本变更 breaking 与迁移说明;golden 基线以 `bun run golden:generate` 重生并人审 diff。

## 3. 已定案(2026-09-24 用户定案)

| # | 问题 | 定案 | 落地要求 |
|---|---|---|---|
| Q1 | `show --json` 的 `deltaCount`/`deltas` | **一步到位删除,不做兼容** | core `report/show.ts` 删两字段;peripheral-commands r21 字段集删 `deltaCount`;`--output deltas` token 删除;`tests/bdd/steps/output-contract.ts` 同步;不保留任何「v1 字节兼容例外」登记,CHANGELOG 仅作 breaking 条目 |
| Q2 | 全局 `--no-interactive` | **删除** | 删 `main.ts` 全局注册与 `config skills --no-interactive` 及伪提示「Run without --no-interactive…」;`config skills` 缺省即输出状态;config-command.feature 同步改写;模板 zh-Hans/en 共 26 处用法删除;`tests/unit/template-command-parity.test.ts` 中对该旗标的放行删除 |
| Q3 | `TemplateEngine` port | **删除零消费声明** | 删 `ports.ts` 的 `TemplateEngine`;`llmanspec/AGENTS.md`「工程规则」对应一行同步改写;`config/changeId.ts` 改用 `templates/engine.ts` 封装(需时为其增加 `throwOnUndefined` 选项);monorepo-structure r3 改为「nunjucks 调用 MUST 收敛在 templates/engine.ts,且 MUST 无 loader、autoescape:false」 |
| Q4 | 测试 helper 整合(B22) | **不在本变更** | 另起 quick change(纯重构、无合约变化),在本变更归档后执行;B22 移入 §4 非目标 |

## 4. 非目标

- 不新增报告字段;不改 TOON 编码。
- 不改 harness 执行语义(第一波已定)。
- 不整合测试 helper(B22,另起 quick change,见 Q4)。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| 删除 `--no-interactive` 破坏外部脚本与已安装的旧 skills | CHANGELOG 迁移说明(「删除该旗标;`init --update` 刷新 skills」);错误为 commander 标准 unknown option,可一眼定位 |
| 删除 `deltaCount`/`deltas` 破坏解析 `show --json` 的下游 | 用户定案不兼容;CHANGELOG breaking 条目点名两字段 |
| 模板瘦身误删行为指引 | r67/r70 两个对账门禁 + golden diff 人审;T 任务要求列出每个删除段落的去向(合并到哪个 unit) |
| rebase 冲突 | T0 首步 rebase,冲突只可能出现在 change 文档(本分支只含本目录) |

## 6. 协作约束

- 第二波单独执行,无并行 change;开工前 `llman-sdd list` 中第一波三项 MUST 已归档。
- req id 自 T0 `spec next-req-id` 实际值起(T0 复核为 r75,设计时预估 r90 偏差);T0 分配全部新 rN(含 D9 两条)。
