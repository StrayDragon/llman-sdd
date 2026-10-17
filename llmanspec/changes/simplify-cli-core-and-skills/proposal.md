---
depends_on: []
title: 统一 CLI 与 core 的重复代码，中文单线化模板，并收敛命令面口径
needs_specs_change: true
---

## Why

本 change 解决四类问题：

- skills 产物教出错误内容。
- 运行时代码违反本仓硬规则。
- 同一逻辑写了三份。
- 模板树维护两份语言。

另有一批命令面口径问题，随本轮调研一并并入。

### skills 产物教出错误内容

r97 的强度词归一化在 zh-Hans 模板上做了无边界替换，把 `要不要继续` 改成 `要不得继续`，并拆散了 8 处加粗标记。证据：

- 语义被毁：`packages/core/templates/zh-Hans/skills/{apply,apply-cycle,archive,verify,propose}.md`。
- 标记未闭合：`zh-Hans/skills/{propose,continue,wayfinder,archive,verify,apply}.md` 共 8 处，形如 `…不得**在默认分支改 specs。`。
- 产物与基线已同病：`.agents/skills/**` 与 `tests/golden/baseline/skills/**`。

`.agents/skills/` 是自举 agent 的直接输入，缺陷会被 agent 读走。门禁 `tests/unit/template-guidance-parity.test.ts` 只查词表、不查加粗配对，r97 的 `不要` 子串规则又误伤 `要不要`。因此该门禁把缺陷固化成正确基线。修文案必须先修门禁。

`packages/core/templates/en/units/skills/validation-hints.md:8` 在 `# language: zh-CN` 头部下写 `Feature:`，本仓解析器实测解析失败。en 系 5 个渲染产物都在教不可解析的样例。

### 运行时代码违反本仓硬规则

`apps/cli/src/cli-shared.ts:49-50` 使用 `Bun.spawnSync` 与 `import.meta.dir`。该规则守护真实分发路径，应当保留：

- npm 同时发布 `@llman-sdd/core` 与 `@llman-sdd/cli`（`.github/workflows/release.yml:80-98`）。
- `apps/cli/package.json:15-20` 的 bin、files、exports 都指向 `./src/main.ts`，npm 用户在 Node ≥ 24 下直接执行这份 TypeScript。
- CI 有显式 Node 冒烟：`node apps/cli/src/main.ts --version`（`.github/workflows/ci.yml:44-48`）。

实测差异：`import.meta.dir` 在 Node 下为 `undefined`；`import.meta.dirname` 在 Bun 与 Node 均可用；`node:child_process.spawnSync` 在两个运行时都返回 `status`，`Bun.spawnSync` 返回 `exitCode`。

### 同一逻辑写了三份

core 内三组概念各写了三份代码，语义已漂移：

- `depends_on` 解析：`report/graph/deps.ts:15`、`validation/changeCheck.ts:202`、`archive/frozenCard.ts:65`。
- active-change 目录遍历：`change/collect.ts:32`、`report/graph/nodes.ts:11`、`report/graph/nodes.ts:112`。
- `.feature` 发现：`validation/discover.ts:16`、`report/specHelpers.ts:21`、`context/tree.ts:107`。

另有 18 个同构 IO port 接口、4 份复制段、7 份近似流程图。

### 模板树维护两份语言

en 树与 zh-Hans 树各 29 个文件，一一平行。每次改动要改两份，两树已出现真实分歧：archive-freeze 的保留窗口、arch-review 的 `subagent_type`、`Feature:` 与 `功能:`。删除 en 树可一次性消除这类分歧，并为后续精简腾出空间。

### 命令面口径不自洽

本轮遍历 36 个命令入口，其中 29 条只读调用在真实仓库执行，30 条写盘调用在临时仓库执行。发现 6 组问题：

- 输出旗标组合三态：`--output json --compact-json` 在 `show` 与 `list` 落单行，在 `validate`、`index check`、`config skills`、`spec unbound`、`review` 被静默忽略（分别 142、6、11、7、98 行）。`list` 的单行由 `apps/cli/src/commands/list.ts:41` 删换行得到，比正确紧凑输出多 858 字节空白。
- 退出码同族不一致：非法枚举值 `--type`、`--stage`、`--sort` 退出 1，而同为非法枚举值的 `--output` 退出 2；`missing required argument` 退出 1，`unknown command` 退出 2。
- `show` 不显示权威 title：frontmatter `title` 非空时仍输出 `title: ""`。根因是 `packages/core/src/change/collect.ts:127` 取 `firstH1`，而模板正文以 `## Why` 开头。
- 收口门禁漏洞：`change finalize` 可对 `stage: draft`、仅 `proposal.md`、specs 未改的 change 收口并退出 0。`packages/core/src/report/show.ts:129` 已算好 6 项判据，收口却未复用。
- `review` 在开发期恒失败：只要存在在途 change 的未勾任务，`criticalCount` 即为 1，退出 1。
- 静默忽略与单值旗标：`project migrate` 带 `--from-version/--to-version` 而不带 `action` 时旗标被忽略且退出 0；`graph --format` 仅接受 mermaid。
- 只读命令违反 r91：`validation` r91 是 CLI 级条款，写明“仅发现单根时所有命令输出 MUST 与单根时代逐字节一致”。实测从子目录运行 `list` 与 `graph` 静默返回空、`config` 泄漏 `ENOENT`，而 `validate --specs` 正确。
- `--backend` 归一化落后前代：前代 `Backend::parse` 做 trim 与 lowercase、接受 `page-index` 别名、空值归 pageindex。现仓四种输入全部报错退出 1。

## What Changes

分五批推进。批次内可并行，批次间按依赖串行。

### 批次 0：止血

- 修 zh-Hans 模板的加粗配对与语义：`要不得继续` 改为 `是否继续`，规避 r97 的 `不要` 子串。
- 门禁补盲：`template-guidance-parity` 增加“加粗配对”与“模板示例可解析”两条断言。
- CLI 侧改 `node:child_process.spawnSync` 与 `import.meta.dirname`，并新增静态断言。
- 清理死代码：`assertCompactJsonPairing` 的死布尔返回、`config.ts` 被覆盖的描述、`archive.ts` 冗余 `catch`、`list.ts` 二次 `resolveOutMode`、`stc-baseline.json` 残留表项。

### 批次 1：模板单线化与适配（破坏性）

- 删除 `packages/core/templates/en/**` 共 29 个文件，保留 `shared/`。
- 未知 locale 一律归一为 `zh-Hans`：改 `templates/locale.ts` 的 `normalizeLocale` 与 `localeFallbacks`。
- `config/schema.ts:77` 的 `locale` 默认值由 `en` 改为 `zh-Hans`。
- 统一 CLI 侧默认值：`commands/init.ts`、`commands/spec.ts:71`、`commands/project.ts:119`、`progress.ts`。
- `init/init.ts:149` 对缺失资源的静默跳过改为显式报错。
- golden 与测试单 locale 化：删除 `tests/golden/baseline/skills-en/`，改写 `tests/golden/{lib,generate,check}.ts` 与对应用例。
- 模板单一事实来源：ethics 块收敛为一份、抽取 `index-fallback` 单元、合并 `git-native-flow` 与 `git-native-flow-brief`。
- 处置死单元与单用单元：`spec/feature-contract` 精简后接回 `propose` 引用，只留独有内容；`workflow/archive-freeze-guidance` 内联。
- 新增“未引用单元”门禁：`UNIT_FILES` 与 `unit()` 引用集合的差集非空即失败。
- 删除无引用模板变量 `specs_framework` 与 `specs_check_command`。
- 修正 4 处与实际不符的指引。
- 新增 `migrations/v0.9-v0.10/README.md`、CHANGELOG 条目与 `MIGRATIONS` 注册项。

### 批次 2：CLI 结构与根发现

- 抽出 `createProgram()` 工厂，`await main()` 移入 `import.meta.main` 守卫。守卫 MUST 带 realpath 兜底：`import.meta.main` 自 Node 24.2.0 才有，而 `engines.node` 声明的下界是 24.0.0。
- 抽出 `emitReport()` 统一报告输出管线。
- 抽出 `addSpecDirOption()` 与 `withSpecRoot()`，`addSpecDirOption` 对全部命令可用。
- 注入 `CliContext { io, git, root, cwd }`，删除 `process.chdir` 全局态，`process.cwd()` 归零。
- 只读命令接入同一根发现算子，未找到实例根时报域错误，不再静默返回空。
- 拆分 `validate.ts` 的 245 行 action。

### 批次 3：core 去重

- `depends_on` 一处解析、两种策略：用 `yaml` 包解析 frontmatter，graph 走宽松策略，validate 走严格策略。
- 收敛 active-change 遍历与 `.feature` 发现。
- 收敛 dated-archive 正则与 semver 比较。
- 收敛 18 个 IO port 接口。
- 路径常量上收，清理死导出与死形参。
- 破 `config` 与 `templates` 模块环，同步收缩允许边表。
- 收敛局部重复：pattern gate、close-out 门错误构造、`review` 复用 `collectUnboundRequirements`。

### 批次 4：命令面口径收敛

- 输出旗标组合定为单一规则：`--output` 显式值优先；`--compact-json` 与 `--json` 成对（前代语义保留）；紧凑输出改由 `JSON.stringify` 单点产生，不再删换行；`--compact-json` 的成对约束写入 help 与 spec。
- 退出码口径补全：参数解析失败（缺必需参数、非法枚举值、非法组合）一律退出 2。根裸调用等同 `--help`，走 stdout 且退出 0；五个纯父分组缺必需子命令报用法错误退出 2，`config` 保留默认 action。此口径是主动 divergence，前代的 handler 级枚举校验原本退出 1。
- `--backend` 归一化改为前代口径：trim 与 lowercase、接受 `page-index` 别名、空值与空 env 归 pageindex。报错文案保留现写法。
- 补一条回归：旧 `rag/` 目录 MUST NOT 满足 pageindex 新鲜度。
- `change next-id`、`change diff`、`spec next-req-id` 接入共享输出面，同时保留 `--json` 的字节一致输出。
- `show` 与 `list` 回显 frontmatter `title`，H1 仅作回退。
- 收口复用 `readyToImplement` 的判据：要求 `specsLanded || !needsSpecsChange`，tasks.md 存在时要求全勾。
- `review` 把在途 change 的未勾任务由 critical 降为 warning。
- `project migrate` 带范围旗标而不带 `action` 时报用法错误。
- 收口细节：`change diff` 空 diff 输出提示、`project migrate` 无 `action` 时报用法错误、`change archive` 与 `archive` 的 help 交叉指引。

## Capabilities

| capability | 变更 |
|---|---|
| `specs/init-generators` | r18 兜底链、r19 双 locale 基线、r50 默认值、r66/r70/r71 双 locale 措辞、r97 en 强度词条款；r70 增加两条门禁 MUST；r71 采“引导对使用者可见”读法 |
| `specs/config-schema` | r6 的 `locale` 缺省值由 `en` 改为 `zh-Hans` |
| `specs/spec-parsing` | r7 与 r88 的方言口径：未知 locale 归一后 `spec skeleton` 恒产出 zh-CN 方言 |
| `specs/monorepo-structure` | r3 守护范围含 `apps/cli/src`；r67 模板面不再含 en |
| `specs/cli` | r75 退出码口径补全；r76 输出旗标组合语义、紧凑输出定义、共享面扩到 3 个命令；新增三条 requirement：入口可导入与守卫、上下文注入与 cwd 隔离、只读命令接入根发现与 `--directory` |
| `specs/validation` | r91 拆两段：多根枚举（`validate`，从 git 根向下扫）与单根解析（各命令，从 cwd 或 `--directory` 向上找最近实例根） |
| `specs/change-lifecycle` | r45/r79 收口复用 `specs-landed` 与 `tasks-done` 判据；r99 的 title 读取面扩到 show/list |
| `specs/review-freeze` | `review` 的未勾任务信号由 critical 降为 warning |
| `specs/peripheral-commands` | `project migrate` 的范围旗标缺 `action` 时报用法错误；`--format` 保留值域守护 |
| `specs/context-index` | r57 的 `--backend` 归一化：trim 与 lowercase、接受 `page-index` 别名、空值归 pageindex |

其余 capability 不产生对外行为变更，作回归守护。

## Impact

- 代码：`apps/cli/src/**`、`packages/core/src/**`、`tests/unit/**`、`tests/bdd/**`。
- 资源与基线：删 en 树 29 个文件；重生成双份基线收敛为一份；刷新 `.agents/skills/**`。
- 迁移：新增 `migrations/v0.9-v0.10/README.md`，并在 `packages/core/src/project/migrations.ts` 注册版本项。
- 破坏面一：`locale: en` 的存量项目升级后渲染结果变为中文。
- 破坏面二：`change finalize` 的守卫收紧，合约未改的 change 不再能收口。
- 破坏面三：五个纯父分组空调用退出码由 0 改为 2；缺必需参数与非法枚举值的退出码由 1 改为 2。根裸调用仍退出 0，但帮助改走 stdout。
- 破坏面四：只读命令在子目录运行时的结果改变。`list` 与 `graph` 此前静默返回空，`config` 此前泄漏 `ENOENT`；此后解析到最近实例根。
- 破坏面五：`--backend` 的空值、大小写与 `page-index` 别名由报错改为接受。

## Non-Goals

- 不删除任何对外命令。
- 不把 6 个 optional skill 纳入 golden 快照门。
- 不改 Gherkin 解析器语义、不改 config schema 字段集、不改冻结归档格式。
- 不改变 Gherkin 方言匹配器（`parser.ts` 仍以 en 起步、回退 zh-CN）。
- 不引入打包器，不引入新运行时依赖。
- `graph --format`、`index rebuild --backend`、`context --backend` 三个旗标保留，本 change 只补 `--backend` 的归一化。不处理 `--version-expr` 与 `--lang` 的去留。

## Open Questions

无。五条已定案：

- `spec/feature-contract`：精简后接回 `propose` 引用，并加“未引用单元”门禁。
- `CliContext`：全量注入，并把可导入与 cwd 隔离写成合约。
- 组命令空调用：根裸调用等同 `--help`，走 stdout 与退出 0；分组缺必需子命令退出 2。
- 三个单值旗标：全部保留，并补 `--backend` 归一化。
- `--directory`：扩到全部命令，只读命令接入根发现算子。

结论的完整依据与数字见 `design.md` 的“决策记录”。
