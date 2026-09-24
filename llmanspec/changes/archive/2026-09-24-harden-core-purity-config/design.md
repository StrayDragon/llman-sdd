# Design: core 纯度与配置契约加固

> **人读摘要**
> - **结论**:5 处纯度违规 + 4 个死配置面 + 3 处判定口径重复,集中在 core 的 config/archive/context/templates/spec 与 barrel;修复后纯度门禁由「只查两个模块导入」升级为「查 `process.*` 与无参墙钟」。
> - **风险**:① 构建期 define(`process.env.LLMAN_SDD_*`)迁到 CLI 后必须仍被 `bun build --compile` 内联——以二进制冒烟验收;② 删除 `scenario-attrs` 属破坏性配置变更;③ 纯度门禁过渡白名单依赖第二波清零。
> - **待决策**:无(`scenario-attrs` 删除已由用户定案;`bdd.bindings` 整体去留登记为第二波待决策,不在本变更)。

---

## 1. 问题清单(证据)

| # | 类别 | 证据 | 说明 |
|---|---|---|---|
| C1 | 纯度 | `packages/core/src/index.ts:5-18` | barrel 顶层 `readFileSync(../package.json)`;`VERSION` 仅被 `apps/cli/src/cli-shared.ts:24` 使用 |
| C2 | 纯度 | `archive/sevenzip.ts:2,62,132` | `import { mkdirSync } from 'node:fs'`;`process.env.LLMAN_SDD_EMBEDDED_7ZZ_WASM_B64`;`mkdirSync(destDir, { recursive: true })` |
| C3 | 纯度 | `templates/embedded.ts:42` | `resolveEmbeddedTable(process.env.LLMAN_SDD_EMBEDDED_TEMPLATES)` |
| C4 | 纯度 + 时钟 | `context/indexStore.ts:49,56,72` | `Date.now()`、`process.pid`、`new Date().toISOString()` |
| C5 | 规范违背 | `config/changeId.ts:53` | `new nunjucks.Environment(undefined, { throwOnUndefined: true })` 未显式 `autoescape: false` |
| C6 | 门禁盲区 | `tests/bdd/assert/core-purity.ts:27-31` | 只查 `node:fs`/`node:child_process` 导入;白名单含 sevenzip 与 index.ts |
| C7 | 死配置 | `config/schema.ts:25-37`;唯一「消费方」`apps/cli/src/commands/review.ts:36` 只取 `kind === 'tags'` | `scenario-attrs` 能过校验、零效果 |
| C8 | 死配置 + 描述错误 | `config/schema.ts:51-54`(描述:Gherkin parsing language);`templates/skills.ts:74,76` 注入 `bdd_feature_dir`/`bdd_default_language`;`rg bdd_default_language\|bdd_feature_dir packages/core/templates` 零命中 | 两字段零消费 |
| C9 | 死导出 | `config/surface.ts:36-54` `setExtraSkills`;仅 `tests/unit/config.test.ts` 使用 | config-command r38 已删 CLI 写路径 |
| C10 | 合约未落实 | r59「加载期编译」;`config/load.ts` 仅 zod;`apps/cli/src/cli-shared.ts:54-65` 分 checked/unchecked;`tests/bdd/steps/config.ts:142-148` Then 未加载非法正则 | 半句假绿 |
| C11 | 描述漂移 | `config/schema.ts:55-59` `run_command` 描述 | 需对齐 validation r13/r48(harness 恢复执行;`--no-check` 跳过) |
| C12 | 口径重复 | `spec/authoring.ts:11,38` `RULE_KEYWORDS.some(k => statement.includes(k))` vs `spec/ir.ts:59` `MUST_WORD_RE` | `MUSTARD` 过 add-req、被 validate 拒 |
| C13 | 死映射 | `spec/parser.ts:24-26` `localeToGherkinLang` 仅测试调用;`report/specHelpers.ts:47-54` 硬编码 `# language: zh-CN` | r7 映射无真实消费方;zh skeleton 规则体仍为 `System MUST ...` |
| C14 | 双实现 | `report/specHelpers.ts:21-44` `nextReqId` 自行遍历 + 解析;`spec/reqRegistry.ts` / authoring 已有注册表 | 两套 rN 口径可漂移 |
| C15 | 门禁不可测 | `scripts/gen-schema.ts --check` 固定比对仓库 artifact;无可执行验收;不在 CI | r6 漂移门无法在不写仓库文件的前提下验证 |

## 2. 决策

### D1 VERSION 迁出 core

- 删除 core `index.ts` 的 `readPackageVersion`/`VERSION` 及 `node:fs`/`node:url` 导入。
- CLI `apps/cli/src/cli-shared.ts`:`version = process.env.LLMAN_SDD_VERSION ?? pkg.version`,`pkg` 以 `import pkg from '../package.json' with { type: 'json' }` 引入(Bun 与 Node ≥ 24 均支持 import attributes;打包时内联,单文件二进制无需运行时读盘)。
- 版本 SSOT 变为 `apps/cli/package.json`;实现者 MUST 确认 `apps/cli/package.json` 与 `packages/core/package.json` 的 version 当前一致(不一致则以 cli 为准并在本任务注释记录)。
- 验收:`CLI --version` 输出与 `apps/cli/package.json` 一致;`bun run build && apps/cli/dist/llman-sdd --version` 输出构建注入值(二进制冒烟 `just smoke-binary`)。

### D2 构建期载荷与目录创建注入

- **原则**:`process.env.LLMAN_SDD_EMBEDDED_*` 是 `bun build --define` 的字面量替换点,替换对整个打包图生效,**读取点可以在 CLI**;core 只接收已解析的值。
- sevenzip:`createSevenZip(opts: { wasmB64?: string; mkdirp: (dir: string) => void })`(以现有导出函数签名为准扩展参数,不改名);`resolveEmbeddedWasmB64` 保持纯函数;删除 `node:fs` 导入。CLI `commands/archive.ts` 传入 `process.env.LLMAN_SDD_EMBEDDED_7ZZ_WASM_B64` 与基于 `node:fs.mkdirSync` 的 `mkdirp`。
- 嵌入模板:`embeddedTemplates(raw?: string)` 由调用方传入 define 值;CLI 调用点(init / skills 渲染路径)传 `process.env.LLMAN_SDD_EMBEDDED_TEMPLATES`。
- 验收:`rg -n "process\\." packages/core/src/archive packages/core/src/templates` 零命中;`just smoke-binary`(构建 + `tests/integration/binary.test.ts`)通过——该测试覆盖二进制内 freeze/thaw 与 init 渲染。

### D3 索引锁 pid 与时钟注入

- `IndexIo` 增加 `currentPid(): number` 与 `now(): Date`;`indexStore.ts` 以 `io.now().getTime()` 替代 `Date.now()`,锁内容与 `buildTimestamp` 缺省值用 `io.now().toISOString()`。
- CLI 的 `IndexIo` 实现(`apps/cli/src/io.ts` 或 index/context 命令内既有工厂)提供 `process.pid` 与 `new Date()`。
- 单测:注入固定 pid=4242 与固定时刻,断言锁文件内容逐字节等于期望串;注入「现在 = startedAt + LOCK_MAX_AGE_MS + 1」断言陈旧锁被清理。

### D4 changeId nunjucks 环境

- `new nunjucks.Environment(undefined, { autoescape: false, throwOnUndefined: true })`。
- 单测:模板 `{{ subject }}`,subject = `a&b<c>` → 渲染结果保持 `a&b<c>`(若随后的 slug 化会剥离特殊字符,则直接对 Environment 渲染结果断言,不经 slug)。

### D5 纯度门禁扩展(core-purity.ts)

- 检查项:① 现有 `node:fs`/`node:child_process` 导入检查,白名单收缩为仅 `git/spawnGit.ts`;② 新增:源码(剥离 `//` 行注释与 `/* */` 块注释后)匹配 `/\bprocess\./u` 即违规;③ 新增:匹配 `/\bDate\.now\(\)|new Date\(\s*\)/u` 即违规(`new Date(x)` 带参允许)。
- **过渡白名单**(仅对 ②③ 生效,每项附注释「由 <change> 清零」):`review/review.ts`(第二波 align-report-cli-surface)、`change/lifecycle.ts`(并行的 fix-lifecycle-validation-defects T9 清零后由第二波移除该条目)。
- 违规输出格式沿用 `core-purity: <file> <原因>`。
- 规格依据:monorepo-structure r3(并行的 align-docs-and-gates 在其 Specs landing 中把「进程环境与墙钟」写入 r3 文本);本变更不改 monorepo-structure.feature。

### D6 死配置清理(r5 改写)

- `bindingSchema` 仅保留 `tagsBindingSchema`;对 `kind: scenario-attrs` 给出定制错误:在 zod 层用 `z.discriminatedUnion` 之外先做预检或 `superRefine`,消息 `bdd.bindings[<i>]: kind "scenario-attrs" has been removed; delete this entry (only kind "tags" is supported)`;该消息计入「前 5 条截断」口径。
- 删除 `bddSchema.default_language` 与 `bddSchema.feature_dir`;`templates/skills.ts` 删除 `bdd_feature_dir`/`bdd_default_language` 变量注入;`init/defaultConfig.ts` 注释模板中删除两行示例。zod 对象缺省 strip 未知键 → 旧配置残留这两个键仍可加载(r5「未知字段宽松放行」同口径,本变更将其扩展到 bdd 段并写入规格)。
- `bdd.run_command` 描述改为:`Harness command executed by validate for spec targets (skip with --no-check). Placeholders: {feature_path}, {feature_dir}, {feature_name}; without placeholders it runs once per validate invocation (batch-once).`
- 删除 `setExtraSkills`、`scenarioAttrsBindingSchema` 及其 barrel 导出与测试。
- `llmanspec/config.yaml` 注释更新:删除「validate --all/--specs 对该命令 batch-once」之外与现状不符的表述;「harness bound 口径」一句改为「list --specs / show 以 @executable tag 拆分已绑定计数」(以代码实际口径为准,实现者核对 `report/specs.ts` 后落笔)。
- `bun run gen:schema` 再生成 artifact。

### D7 加载期编译(r59)

- `loadConfig` 在 zod 解析成功后,若 `change_id.pattern` 存在则调用 `compileChangeIdPattern`;失败抛 `ConfigValidationError`,issue 路径 `change_id.pattern`,消息含正则引擎原始错误。
- `loadCliConfig` 去掉自身的编译步骤(已由 core 承担);`loadCliConfigUnchecked` 因行为与 checked 等价而成为冗余——其调用方 `commands/change.ts`(第一波归 A)不在本变更所有权内,故**保留函数但改为直接复用 `loadCliConfig`**,删除登记给第二波。
- 注意:此后 archive / skeleton / review 路径在 pattern 非法时也会失败——符合 r59「加载期编译」原意,Impact 已声明。

### D8 判定口径去重

- `spec/authoring.ts`:删除 `RULE_KEYWORDS`,改为 `MUST_WORD_RE.test(statement)`;错误消息保持列出 `MUST/SHALL/必须/不得/禁止`(从一个与正则同文件导出的常量数组生成,正则由该数组构造,保证两者同源)。
- `report/specHelpers.ts`:`skeletonContent` 的 `# language:` 行 = `localeToGherkinLang(zh ? 'zh-Hans' : 'en')`;zh 规则体改为 `系统 MUST ...`(保留 MUST 以通过 r9 语义词检查);`nextReqId` 改为经 req 注册表(`spec/reqRegistry.ts` 现有 API)收集「规则(@human)req id」后取最小空闲——保持 v1 语义(仅规则占号)不变。
- skeleton 的 `io.mkdirp('src/')` 副作用与 `# scope: src/` 占位属 peripheral-commands r22,**不在本变更**(登记第二波)。

### D9 gen-schema 可测化(r6)

- `scripts/gen-schema.ts --check [artifactPath]`:缺省路径不变;给出路径时与该文件比对。退出码:一致 0,不一致 1,并打印首个差异行号。
- 可执行验收:复制 artifact 到临时目录 → `--check <tmp>` 退出 0 → 篡改副本一个字符 → `--check <tmp>` 非零。仓库文件零写入。

### D10 可执行验收 seam

- config-schema:core `loadConfig` 公共 API(`tests/bdd/steps/config.ts` 既有「加载该 config」步骤)+ CLI 子进程(validate / check:schema)。
- spec-parsing:core `parseFeatureSource`/`parseCapability`(`tests/bdd/steps/parse.ts` 既有步骤)+ CLI `spec skeleton`。
- spec-authoring:CLI 子进程(`tests/bdd/steps/spec-authoring.ts` 既有 TempRepo)。

## 3. 规格落地摘要(Specs landing)

- config-schema:r5 改写(bindings 仅 tags、scenario-attrs 报错、bdd 段死字段移除与宽松忽略);r6 可执行验收新增(check 漂移门);r59 拆分验收(validate 强制 / 加载期报错)。
- spec-parsing:r7 改写(映射 MUST 用于 skeleton `# language:` 头);r9 可执行验收新增(残留 @manual / 互斥 / 缺语义词逐项报告)。
- spec-authoring:r41 改写(语义词判定与 r9 同口径、词边界);r43 可执行验收新增(resolve-req statement 断言 / dedupe --dry-run 零副作用)。

## 4. 非目标

- 不改 review(`process.env.LLMANSPEC_BASE_REF`、bindings 参数)、不删 `bdd.bindings` 整体、不改 skeleton 的 scope 占位与 `src/` 创建、不做 barrel 大收窄——均归第二波 align-report-cli-surface。
- 不改 `ports.ts`(第一波归 A;`TemplateEngine` 端口去留归第二波)。

## 5. 风险与回滚

| 风险 | 缓解 |
|---|---|
| define 迁移后二进制内联失效(运行时拿到 undefined) | T2 以 `just smoke-binary` 为完成判据;失败即回滚到 core 读取 |
| `scenario-attrs` 删除影响外部用户 | 定制错误消息给出唯一修复动作;CHANGELOG 由协调者在收口时登记 Breaking |
| 纯度门禁误报(注释/字符串中的 `process.`) | 剥离注释后匹配;字符串字面量中的 `process.` 视为违规(core 内不应出现),若确有需要走白名单并注明原因 |

## 6. 第一波协作约束

**req id 号段**:本变更 r80–r84(本次 Specs landing 未新增 rN;号段预留给实施中若需新增规则)。其余见 fix-lifecycle-validation-defects design §7。

**文件所有权**(第一波内独占):

- `packages/core/src/index.ts`(独占)、`packages/core/src/config/**`、`packages/core/src/archive/**`、`packages/core/src/context/indexStore.ts`、`packages/core/src/templates/{embedded,skills}.ts`、`packages/core/src/init/defaultConfig.ts`、`packages/core/src/spec/**`、`packages/core/src/report/specHelpers.ts`
- `apps/cli/src/{cli-shared,io}.ts`、`apps/cli/src/commands/{archive,index,context,init,spec,config,project}.ts`、`apps/cli/package.json`(仅在 D1 需要时)
- `scripts/gen-schema.ts`、`artifacts/schema/**`、`llmanspec/config.yaml`
- `tests/bdd/assert/core-purity.ts`、`tests/bdd/steps/{config,parse,spec-authoring,context-index,context}.ts`、`tests/unit/{config,spec,archive,embedded-templates,embedded-wasm,context,templates}.test.ts`
- `llmanspec/specs/{config-schema,spec-parsing,spec-authoring}.feature`
- **禁止触碰**:`packages/core/src/{change,validation,git}/**`、`packages/core/src/ports.ts`、`packages/core/src/report/show.ts`、`apps/cli/src/commands/{validate,change}.ts`(归 A);`AGENTS.md`、`llmanspec/AGENTS.md`、`justfile`、`.github/**`、`llmanspec/specs/monorepo-structure.feature`(归 D);`packages/core/templates/**`。
