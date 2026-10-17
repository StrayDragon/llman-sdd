---
depends_on: []
title: 统一 CLI 与 core 的重复代码，默认中文化 skills 模板并补齐门禁盲区
needs_specs_change: true
---

## Why

本 change 解决三类问题：skills 产物教出错误内容、同一逻辑写了三份代码、模板树维护两份语言。

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

## What Changes

分四批推进。批次内可并行，批次间按依赖串行。

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
- 处置死单元与单用单元：`spec/feature-contract` 接回引用、`workflow/archive-freeze-guidance` 内联。
- 删除无引用模板变量 `specs_framework` 与 `specs_check_command`。
- 修正 4 处与实际不符的指引。
- 新增 `migrations/v0.9-v0.10/README.md`、CHANGELOG 条目与 `MIGRATIONS` 注册项。

### 批次 2：CLI 结构

- 抽出 `createProgram()` 工厂，`await main()` 移入 `import.meta.main` 守卫。
- 抽出 `emitReport()` 统一报告输出管线。
- 抽出 `addSpecDirOption()` 与 `withSpecRoot()`。
- 注入 `CliContext { io, git, root, cwd }`，删除 `process.chdir` 全局态。
- 拆分 `validate.ts` 的 245 行 action。

### 批次 3：core 去重

- `depends_on` 一处解析、两种策略：用 `yaml` 包解析 frontmatter，graph 走宽松策略，validate 走严格策略。
- 收敛 active-change 遍历与 `.feature` 发现。
- 收敛 dated-archive 正则与 semver 比较。
- 收敛 18 个 IO port 接口。
- 路径常量上收，清理死导出与死形参。
- 破 `config` 与 `templates` 模块环，同步收缩允许边表。
- 收敛局部重复：pattern gate、close-out 门错误构造、`review` 复用 `collectUnboundRequirements`。

## Capabilities

| capability | 变更 |
|---|---|
| `specs/init-generators` | r18 兜底链、r19 双 locale 基线、r50 默认值、r66/r70/r71 双 locale 措辞、r97 en 强度词条款；r70 增加两条门禁 MUST |
| `specs/config-schema` | r6 的 `locale` 缺省值由 `en` 改为 `zh-Hans` |
| `specs/spec-parsing` | r7 与 r88 的方言口径：未知 locale 归一后 `spec skeleton` 恒产出 zh-CN 方言 |
| `specs/monorepo-structure` | r3 守护范围含 `apps/cli/src`；r67 模板面不再含 en |

其余 capability 不产生对外行为变更，作回归守护。

## Impact

- 代码：`apps/cli/src/**`、`packages/core/src/**`、`tests/unit/**`、`tests/bdd/**`。
- 资源与基线：删 en 树 29 个文件；重生成双份基线收敛为一份；刷新 `.agents/skills/**`。
- 迁移：新增 `migrations/v0.9-v0.10/README.md`，并在 `packages/core/src/project/migrations.ts` 注册版本项。
- 破坏面：`locale: en` 的存量项目升级后渲染结果变为中文。

## Non-Goals

- 不删任何对外命令或旗标。
- 不把 6 个 optional skill 纳入 golden 快照门。
- 不改 Gherkin 解析器语义、不改 config schema 字段集、不改冻结归档格式。
- 不改变 Gherkin 方言匹配器（`parser.ts` 仍以 en 起步、回退 zh-CN）。
- 不引入打包器，不引入新运行时依赖。

## Open Questions

- `spec/feature-contract` 单元接回引用还是删除。倾向接回，因为 r71 已把该单元当作权威引导实体。
- `CliContext` 注入的推进幅度。倾向全量替换，否则不解决嵌入态。
