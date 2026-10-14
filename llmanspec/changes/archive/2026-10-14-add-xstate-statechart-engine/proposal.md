---
depends_on: []
title: 基于原生 Gherkin 场景大纲与 XState 构建自动发现的状态流转验证引擎
branch: sdd/add-xstate-statechart-engine
base_branch: main
base_sha: 2f89ceb72510259f8a0699f31f3e22b0ad2d1237
---

# 基于原生 Gherkin 场景大纲与 XState 构建自动发现的状态流转验证引擎

## Why

当前 `llman-sdd` 的行为合约采用原生 Gherkin（`功能:` → `规则:` → `场景: 假如/当/那么`）。对于无状态规则与离散示例，线性 `场景:` 表达清晰；但面对有状态生命周期或状态流转需求（如本仓库自身的 `change-lifecycle` 阶段演进、或外部多语言用户项目中的业务状态流转），纯离散 `场景:` 存在三大结构性痛点：

1. **缺乏图论完备性守卫**：离散 `场景:` 只是状态空间的抽样点，无法从静态层面检测孤岛状态（Unreachable State）、死锁/陷阱状态（Deadlock / Sink State）或非确定性转移冲突（Non-deterministic Transition）。
2. **跨语言与外部 Agent 零概念负担约束**：`llman-sdd` 用户横跨 Rust、Python、Go、TS 等多语言生态，且大量依赖外部 AI Agent（Claude Code、Codex、Pi）读取 Skill 编写规约。若引入生僻的学术词汇（如 `statechart`）、自定义 DSL、非标 Tag 或要求用户在 `config.yaml` 手工维护内部规则编号列表（如 `required_rules`），既增加认知负担，又浪费上下文 Token。
3. **AI Agent 门禁逃逸风险（Reward Hacking）**：若状态流转校验存在 `WARNING` 软门禁、允许写“残缺表头（如写了 `from/to` 漏写 `event`）”或“假步骤（不绑定 `<from>`/`<event>`/`<to>` 占位符）”，Agent 在实施受阻时极易通过后门绕过契约验证。

通过将 **100% 原生 Gherkin `场景大纲:`（`Scenario Outline:`）+ `例子:`（`Examples:`）状态流转表（零 Tag、零自定义语法、100% 自动发现）** 与 `packages/core` 内置的 **XState（`xstate` + `@statelyai/graph`）静态图验证引擎** 结合，并在 `llmanspec/config.yaml` 中通过一行直观的布尔开关 `specs.check_transitions: true`（与 `specs.check_command` 对仗，默认关闭）按需启用、启用后全自动发现并执行 **4 道全 `ERROR` 零逃逸门禁**，即可在零额外概念、跨语言 100% 原生可执行的前提下，为有状态规约提供形式化图论守卫。

## What Changes

- **配置契约扩展（`config-schema`）**：
  - 在 `llmanspec/config.yaml` 的 `specs` 段新增可选布尔配置 `check_transitions: boolean`（默认 `false`/未启用，存量项目 100% 零影响；无任何嵌套对象或 `required_rules` 列表），并同步更新 JSON Schema 产物（`artifacts/schema/configs/en/llmanspec-config.schema.json`）。
- **原生 Gherkin `场景大纲:` / `例子:` 解析与 BDD Runner 行展开（`spec-parsing` & `tests/bdd/runner.ts`）**：
  - 扩展 `packages/core/src/spec/ir.ts` 与 `parser.ts`：在 `ScenarioIR` 中保留 `isOutline` 与 `examples`（纯表头 `headers` 与行数据 `rows`，零 Tag 字段）。
  - 升级本仓 `tests/bdd/runner.ts`：对包含 `examples` 的 `场景大纲:`，按行展开 `<col>` 占位符并生成独立执行的 `bun:test` 用例，使状态流转表的每一条边都作为真实测试运行。
- **全自动发现 + XState 4 道零逃逸 `ERROR` 状态流转验证引擎（`validation`）**：
  - 在 `packages/core` 引入 `xstate` 与 `@statelyai/graph`（纯内存纯函数调用，零 I/O 副作用，符合双运行时约束），新增 `packages/core/src/validation/transitions.ts`。
  - 当 `specs.check_transitions: true` 时，自动扫描所有包含 `例子:` 表的 `场景大纲:`：凡表头出现状态流转特征列（含 `from`+`to`、`初始状态`+`目标状态`，或含 `event`/`事件` 与其一）即自动识别为状态流转表，执行 4 道不可绕过的 `ERROR` 门禁（挂载路径 `<cap>/transitions/<req_id>`）：
    1. **E1 表结构完整与步骤占位符绑定门禁（Structure & Placeholder Binding Gate）**：缺必填三元组列 `[from, event, to]`（或 `[初始状态, 事件, 目标状态]`，例如只写了 `from/to` 漏写 `event`）、表行数 `< 1`、去重状态数 `< 2`、单元格为空、`!sc.runnable`，或 `假如(Given)` 未引用 `<from>`（及有 `guard` 列时的 `<guard>`）、`当(When)` 未引用 `<event>`、`那么(Then)` 未引用 `<to>` 直接判 `ERROR`。
    2. **E2 XState 确定性门禁（Determinism Gate）**：同一 `(from, event, guard)` 指向不同 `to` 或存在重复行直接判 `ERROR`。
    3. **E3 XState 孤岛/不可达门禁（Reachability Gate）**：以首行 `from` 为初始态，经 XState 图遍历存在不可达状态直接判 `ERROR`。
    4. **E4 XState 死锁/陷阱门禁（Deadlock Gate）**：存在既非合法终态（叶子状态或显式返回路径）又无法到达任何终态的死循环强连通分量或纯自环非终态直接判 `ERROR`。
- **本仓自举（`change-lifecycle`）**：
  - 在本仓库 `llmanspec/config.yaml` 中启用 `specs.check_transitions: true`，并将 `llmanspec/specs/change-lifecycle.feature` 的 `@req:r34`（stage 单调推断规则）升级为含原生 Gherkin 状态流转表的自举验证规则（不新增任何 `spec add-*` CLI 子命令，零 CLI 表面膨胀）。

## Capabilities

- `config-schema`（新增 `@req:r102`：`specs.check_transitions` 布尔配置契约与 Schema 同步）
- `spec-parsing`（新增 `@req:r103`：原生 Gherkin `场景大纲:` 与 `例子:` 表格 IR 解析及 BDD Runner 行展开）
- `validation`（新增 `@req:r104`：`check_transitions` 状态流转表自动发现与 4 道零后门 `ERROR` 校验门禁）
- `change-lifecycle`（更新 `@req:r34`：补入原生 Gherkin 状态流转 `场景大纲:` 自举示例）

## Impact

- **破坏性变更**：无。`specs.check_transitions` 缺省关闭；未启用该配置的存量仓库行为、输出与退出码逐字节保持不变。
- **依赖影响**：`packages/core` 新增运行时纯函数依赖 `xstate`（v5）与 `@statelyai/graph`，均无 Node/Bun 专属原生绑定，100% 兼容 `bun build --compile` 单二进制打包与 Node >= 24。
- **CLI 表面**：零新增子命令或旗标，完全由 `llman-sdd validate` / `review` 自动感知 `specs.check_transitions: true` 驱动。

## Open Questions

- [x] **语法选型**：已定案——严禁自定义 DSL 与任何新增 Tag，100% 使用原生 Gherkin `场景大纲:` (`Scenario Outline:`) + `例子:` (`Examples:`) 表格表达状态流转。
- [x] **配置命名与自动发现**：已定案——淘汰 `statechart`、`required_rules` 与冗余的 `spec add-*` 子命令，在 `llmanspec/config.yaml` 的 `specs:` 段下仅使用单行布尔开关 `check_transitions: true`（与 `check_command` 对仗），开启后 100% 自动发现所有状态流转表（含残缺表头拦截），错误路径锚点统一为 `<cap>/transitions/<req_id>`。
