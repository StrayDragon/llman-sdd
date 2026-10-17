# Design: simplify-cli-core-and-skills

## 目标架构

```
packages/core                    纯域逻辑，每个概念一个 SSOT
  ├─ frontmatter 读取            extractFrontmatter 为唯一切分口径
  │    readDeps(text, mode)      mode=lenient 供 graph，mode=strict 供 validate
  ├─ 共享算子
  │    walkActiveChangeDirs()    收编三份遍历
  │    discoverSpecs()           收编三份 .feature 发现
  │    datedArchiveId() / compareSemver()
  ├─ ports
  │    interface FsPort          各模块 Pick 收窄
  └─ barrel index.ts            只导出有消费者的符号

apps/cli                         应用服务层加可嵌入入口
  ├─ program.ts                 export createProgram(ctx): Command
  ├─ main.ts                    import.meta.main 守卫，仅装配
  ├─ CliContext                 { io, git, root, cwd }
  ├─ emitReport()               输出管线单点
  └─ commands/*                 仅解析参数，调 core

packages/core/templates          中文单线
  ├─ zh-Hans/**                 唯一内置语言包
  ├─ shared/review.html         语言无关
  └─ units/skills/ethics-governance.md   ethics 唯一来源
```

## 批次 0：止血

### 0.1 zh-Hans 模板批改坏

结论：改词，不改词表。

- 根因：r97 禁 `不要` 子串，既有文案 `要不要继续` 被无边界替换成 `要不得继续`，加粗标记同时被拆散。
- 修法：`要不要继续` 改为 `是否继续`。语义不变，且不含被禁子串。
- 修法：逐处恢复加粗配对，写成 `**不得问"是否继续？"**`。
- 说明：放宽 r97 词表要改 spec，且削弱门禁。改近义词成本更低。

### 0.2 门禁补盲

两条断言放进既有 `tests/unit/template-guidance-parity.test.ts`。该文件随 `bun test` 运行，故 `qa` 聚合集合不变。

1. 加粗配对：扫描每个源模板的围栏外 `**` 计数，奇数即报出来源文件与行号。
2. 模板示例可解析：抽取带 `# language:` 头的围栏块，用本仓 `parseCapability` 试解析，失败即报出来源与错误。

警告：两条断言必须与 0.1 的修复同批完成，否则门禁先红。

### 0.3 CLI 侧 node-only

结论：保留规则，修 2 处调用。

- 改 `cli-shared.ts`：`Bun.spawnSync` 换成 `node:child_process.spawnSync`，`import.meta.dir` 换成 `import.meta.dirname`。
- 注意：`Bun.spawnSync` 返回 `exitCode`，`node:child_process.spawnSync` 返回 `status`。替换不是纯改名。
- 新增只读断言扫描 `apps/cli/src/**`，命中 `Bun.` 或非 `dirname` 的 `import.meta.dir` 即失败。
- 去掉会吞掉 `ReferenceError` 的宽 `catch`，改为显式降级。

## 批次 1：模板单线化与适配

### 1.1 删除 en 树（破坏性）

结论：删除 `packages/core/templates/en/**` 共 29 个文件，保留 `shared/review.html`。

`shared/` 不经 locale 链，由 `review.ts` 用 `join(TEMPLATES_ROOT, 'shared', 'review.html')` 直取，删 en 不影响该文件。

`embedded.ts` 与 `build-binary.ts` 对 locale 无假设，删 en 只是嵌入表少 29 条、二进制变小。

### 1.2 locale 归一与兜底

结论：未知 locale 一律归一为 `zh-Hans`，兜底链尾改为“内置默认语言包”。

- `normalizeLocale`：空值、`zh` 前缀、`en` 前缀、未知值都返回 `zh-Hans`。保留分支形状，便于日后加回英文。
- `localeFallbacks`：返回 `[归一化值, 语言主部]` 去重序列，再补内置默认 `zh-Hans`。
- 引入常量 `DEFAULT_LOCALE = 'zh-Hans'`，供默认值、兜底链尾、CLI 兜底三处共用。

注意：本条会连带改变 `spec skeleton` 的方言。`skeletonContent` 取 `localeFallbacks(locale)[0]`，归一后恒为 `zh-Hans`，故骨架恒产出 `# language: zh-CN`。`localeToGherkinLang` 同样先归一，行 `en` 项目的骨架方言由 en 变为 zh-CN。`spec-parsing` r7 的对应场景必须改写。

### 1.3 默认值单点

结论：默认值只保留一处来源。

- `config/schema.ts:77` 的 `locale` 默认值由 `en` 改为 `zh-Hans`。
- `init/defaultConfig.ts` 删除 `DEFAULT_CONFIG_EN`，只留中文模板。`writeDefaultConfig` 先归一 locale 再选模板，去掉精确串比较。
- CLI 侧 `?? 'en'` 全部换成 `?? DEFAULT_LOCALE`：`commands/spec.ts:71`、`commands/project.ts:119`、`progress.ts`。
- `commands/init.ts` 的 help 文案 `built-in default en` 改为 `built-in default zh-Hans`。

警告：只改兜底链而不改 schema 默认值，新项目会渲染失败。两处必须同批完成。

### 1.4 资源缺失改为显式报错

结论：`init.ts:149` 的静默 `continue` 改为报错。

现状是缺失资源时不写托管块，命令仍退出 0。用户会看到“命令成功但托管块陈旧”。这比抛错更隐蔽。

### 1.5 golden 与测试单 locale 化

- 删除 `tests/golden/baseline/skills-en/`（10 个文件）。
- `tests/golden/lib.ts` 删除 `CONFIG_YAML_EN` 与 `renderSkills` 的 locale 分支。
- `tests/golden/generate.ts` 与 `check.ts` 的 locale 表收为单元素。
- `tests/unit/template-guidance-parity.test.ts:18` 的 `LOCALES` 收为 `['zh-Hans']`。该文件直接读模板源，不收会 ENOENT 崩。
- 改写断言 en 行为的用例：`templates.test.ts`、`config.test.ts`、`init.test.ts`。
- 重写 `tests/bdd/steps/meta-foundation.ts` 的 r18 资源桩。现桩把唯一 unit 资源放在 en，断言回退命中 en。删 en 后回退目标改为 zh-Hans。
- 改写 `tests/bdd/steps/init.ts` 的 en 分支。

### 1.6 模板单一事实来源

- ethics 块：以 `units/skills/ethics-governance.md` 为唯一来源；`structured-protocol` 删除逐字重复的内联块；`apply-cycle` 的差异值评估为覆写或统一。
- 抽取 `units/skills/index-fallback.md`，消除 explore、propose、apply、quick 的 4 份复制。
- 合并 `git-native-flow` 与 `git-native-flow-brief`，并修“根 AGENTS.md 含全图”的悬空引用。

`enforceEthicsGovernance` 的 5 键齐全门保持不变。

### 1.7 死单元与单用单元

- `spec/feature-contract`：接回 `unit()` 引用，兑现 r71。若实施期改判删除，须同步改 r71 措辞。
- `workflow/archive-freeze-guidance`：内联进 `skills/llman-sdd-archive.md`，从 `UNIT_FILES` 移除。

### 1.8 死变量与不符指引

- 删除 `specs_framework` 与 `specs_check_command` 的计算与注入，并同步删单测断言与 barrel 再导出。
- 修 4 处指引：`apply` 误称 `config` 报告 `specs.check_command`；`propose` 与 `draft` 的 frontmatter 枚举漏 `base_branch`；`validate` 的 `morphology` 字段层级描述。

### 1.9 迁移与 CHANGELOG

- 新增 `migrations/v0.9-v0.10/README.md`，按现有形态写“破坏面”与“升级步骤”。
- `packages/core/src/project/migrations.ts` 增加版本项，`prompt` 说明 en 移除与 locale 归一。
- `CHANGELOG.md` 增加条目，标注破坏性。

## 批次 2：CLI 结构

### 2.1 createProgram 工厂

结论：拆出入口，使其可导入。

- 新增 `apps/cli/src/program.ts`，导出 `createProgram(ctx): Command`，只建命令树不解析。
- `main.ts` 保留参数解析与统一错误出口，并加 `if (import.meta.main)` 守卫。
- `apps/cli/package.json` 的 `exports` 改指可导入入口。
- `tests/unit/removed-surface.test.ts` 改为调用工厂，删除注册顺序的复刻。

注意：`main.ts:19-22` 声明注册顺序 load-bearing，工厂必须保持同一顺序。

### 2.2 emitReport 输出管线

结论：输出分派收敛为单点。

签名：`emitReport(value, opts, humanFn?)`。内部依次做 pairing 校验、`resolveOutMode`、`renderMachine`、human 回退。

迁移 `config`、`index`、`spec`、`review`、`list`、`validate`。删除 `show.ts` 的 49 行自建 token 解析，改为复用，保留其自定义 `outputHint`。

硬约束：`cli` r76 的旗标面、缺省 TOON、`show --output compact-json` 单行可解析都不变。这是内部重构，不得改变任何输出字节。

### 2.3 选项与根解析收敛

- 抽 `addSpecDirOption(cmd)`，消除 6 处逐字节相同的 `--directory` 声明。
- 抽 `withSpecRoot(dir, fn)`，统一 `resolveRootSpecsDir`、`loadRootSpecEntries` 与 `loadSpecEntries` 的分叉。

### 2.4 CliContext 注入

结论：全局态收敛为注入。

- 引入 `CliContext { io, git, root, cwd }`，由 `main` 解析一次并注入。
- 替换 16 处 `makeCliGit(process.cwd())` 与 39 处 `process.cwd()`。
- 删除 `validate.ts` 的 `process.chdir` 与配套 `try/finally`，改为按 root 传参。

警告：本批改动面最大，宜最后做并单独提交，便于回退。

### 2.5 validate action 拆分

把 `validate.ts:291-535` 的 245 行回调提取为 `runAllRoots`、`resolveRootArg`、`runSingleItem`、`runBulk`。纯提取，不改行为。

## 批次 3：core 去重

### 3.1 depends_on 一处解析、两种策略

结论：规范要求两种策略，故统一解析、分开策略。

权威条款：

- `peripheral-commands` r30：graph 读 MUST 支持流式与块式、边集合一致、畸形按无依赖且不中断。→ 宽松。
- `validation` r73：每项 MUST 命中活跃 change、归档目录或平铺卡，未命中 MUST 报 `references unknown change: <id>`；frontmatter MUST 单一口径。→ 严格。
- `review-freeze` r24/r25：卡内 `depends_on` 归一为单行 flow，供 graph 解析。

设计：

1. 新增单点 `readDeps(text, mode)`。先用 `extractFrontmatter` 切块，再用 `yaml.parseDocument` 取键值数组。
2. `mode='lenient'` 供 graph：缺失、非法或解析失败都返回 `[]`；非字符串项丢弃；绝不抛。
3. `mode='strict'` 供 validate：键存在但非列表报“must be a list of change ID strings”；每项转字符串后须命中活跃 change、归档目录或平铺卡，否则报 `references unknown change: <id>`。
4. 裸 `depends_on:`（YAML null）在两种模式都按空列表处理。
5. 冻结卡写入改用宽松解析加归一化 flow，替换手写扫描。
6. 删除三份手写解析。

改用 `yaml` 包后，引号、多行流式、冒号前空格、行内注释四类偏差一次性消失。

数字项在严格模式下报 `references unknown change: 123`，替代现状的另一条消息。这符合 r73 的消息要求。

### 3.2 遍历收敛

- active-change 遍历收编到 `change/collect.ts:32`，`report/graph/nodes.ts` 的两份改为调用。
- `.feature` 发现收编到 `validation/discover.ts:16`，`report/specHelpers.ts:21` 与 `context/tree.ts:107` 改为调用，统一排序与路径规范化。

注意：收敛会改变 graph 节点顺序与 spec hash。必须核对 `context/tree` 的 hash 稳定性，避免 `index check` 误报新鲜度。

### 3.3 正则与比较器

dated-archive id 正则的 4 个变体收敛为单点。semver 比较的 2 份收敛为单点。

### 3.4 port 收敛

引入 `interface FsPort`，各模块用 `Pick` 收窄，替换 18 个同构接口。`change/resolve.ts:22` 顺带收窄，不再要求 `mtimeMs`。

纯度不受影响：收敛方向只用类型，不引入 `node:fs`。

### 3.5 常量与死导出

- 复用 `CHANGES_DIR`，新增 `SPECS_DIR`，清理 `changeCheck.ts:188`、`init.ts:185`、`validate.ts:175` 的字面量。
- 删除零消费者导出：`validateTransitionTableSelfCheck`、`MAX_REPORTED_ISSUES`、`ROOT_EXCLUDED_DIRS` 等。
- 删除 `validateCapability` 的死 `_io` 形参。
- barrel 补 `specsLanded` 导出，测试改走 barrel，消除 2 处 deep import。

### 3.6 破模块环

`config/changeId.ts:8` 与 `templates/skills.ts:1` 构成 `config` 与 `templates` 环。把 `SddConfig` 类型或 locale 依赖下沉，断开一条边。

`monorepo-structure` r72 已规定“收窄 MUST 同步删表”，故须同步收缩 `module-dependency-parity` 的允许边表。

### 3.7 局部重复

- 合并 `validation/changeCheck.ts` 内两处 pattern gate。
- 提取 `change/lifecycle.ts` 中 finalize 与 archive 逐字重复的 close-out 门错误构造。
- `review/review.ts:56` 改用 `report/unbound.ts:29` 的 `collectUnboundRequirements`。

## 保留红线

- `report/specHelpers.ts:47` 的 max+1 与 `spec/authoring.ts:240` 的 smallest-free 是有意分叉。前者注释已记载与前任分叉的理由，不得合并。
- 破环必须同步收缩允许边表，否则 `module-dependency-parity` 因表漂移而失败。
- 批次 3 的任何收敛都不得引入 `node:fs`、`node:child_process`、`process` 或墙钟到 core。
- 不得把 `progress.ts` 的进度提示语言、`migrateNotes.ts` 的迁移 note 语言、`parser.ts` 的 Gherkin 方言当成模板 locale 一并删除。三者是独立维度。

## 验证策略

- 层级：L1 定向 `tests/unit/*`；L2 定向 `bun test tests/bdd -t "<模式>"`；L3 `llman-sdd validate --check`；L4 `just qa` 兜底。
- 前后对比判据（重复代码数、死导出数、模板复制份数、测试用例数）必须在本 change 分支相对 merge-base 测量。默认分支测得的值不构成证据。
- 重构类任务必须对比测试用例数，不得以减少覆盖换绿。
- 编辑与验证不得同批并行。

## 备选方案

- 按层拆三个 change：批次 0 与批次 1 触碰同一批文件与基线，拆开要两次刷新基线并易冲突，故合并。
- 只修文案不补门禁：r97 的 `不要` 子串规则仍在，缺陷会再次被固化，故必须补门禁。
- 保留 en 树只改默认值：双语言维护成本与两树分歧仍在，不符合本次目标。
- 未知 locale 只改兜底链尾：改动面更小，但语义不统一。已按决策采用“一律归一为 zh-Hans”。
