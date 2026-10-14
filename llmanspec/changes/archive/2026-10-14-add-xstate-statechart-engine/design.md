# Design: 原生 Gherkin 场景大纲 + XState 自动发现状态流转验证引擎 (`check_transitions`)

## 1. 架构目标与核心原则

1. **零自定义语法、零 Tag、零 CLI 膨胀（Pure Native Gherkin & Intuitive Naming）**：
   - 不引入任何自定义围栏代码块、不引入任何 Tag、不暴露 `statechart` 等生僻学术词汇、不新增多余的 CLI `spec add-*` 子命令。
   - 配置键名采用直观的 **`specs.check_transitions: true`**（与 `specs.check_command` 动词对仗），错误锚点采用 **`<cap>/transitions/<req_id>`**。
   - 100% 复用 Gherkin 原生语法：`场景大纲:`（`Scenario Outline:`）+ `例子:`（`Examples:`）表格。
2. **100% 自动发现、无需手工维护 `required_rules`（Zero-Config Auto-Discovery）**：
   - 不要求用户在 `config.yaml` 中手工罗列内部 `rN` 编号（彻底移除 `required_rules` 与 `required_capabilities`）。
   - 当 `specs.check_transitions: true` 时，`validate` 自动扫描所有 `.feature` 中带 `例子:`（`Examples:`）的 `场景大纲:`：不仅识别完整的 `[from, event, to]` 表，还会自动捕获“残缺状态表”（如写了 `from` + `to` 却漏写 `event`），直接判 `ERROR` 防止漏列逃逸。
3. **Pure Core 纪律（`packages/core`）**：
   - `xstate`（v5 `createMachine`）与 `@statelyai/graph` 全部收敛于 `packages/core/src/validation/transitions.ts` 纯函数模块中，零 I/O、零 `Bun.*` 专属 API，满足 Node >= 24 与 Bun 双运行时契约。

---

## 2. 模块设计与接口契约

### D1: `config-schema` — `specs.check_transitions` 极简布尔开关（`packages/core/src/config/schema.ts`）

在 `specsSchema`（以及 `llmanspec/specs/config-schema.feature` 的 `@req:r5` 允许字段说明）中新增可选布尔字段 `check_transitions`：

```ts
export const specsSchema = z.object({
  framework: z
    .string()
    .default('')
    .describe(
      'BDD framework identifier (optional). Only used to derive a default check_command when check_command is unset.',
    ),
  check_command: z
    .string()
    .nullish()
    .describe(
      'Spec verification command executed by validate for spec targets (opt-in via --check; default skips). Placeholders: {feature_path}, {feature_dir}, {feature_name}; without placeholders it runs once per validate invocation (batch-once). Legacy `bdd.run_command` is elevated onto this key at load time.',
    ),
  verify_prompt: z.string().nullish().describe('Extra prompt text injected during verify phase.'),
  check_transitions: z
    .boolean()
    .nullish()
    .describe(
      'When true, automatically discovers Gherkin Scenario Outline state transition tables (from/event/to) and enforces strict XState graph gates (determinism, reachability, deadlock, and step placeholder binding). Default: false.',
    ),
});
```

- 无嵌套对象、无 `required_rules`、`normalize` 仅需 `Boolean(config?.specs?.check_transitions)`。
- 运行 `bun run scripts/gen-schema.ts` 更新 `artifacts/schema/configs/en/llmanspec-config.schema.json`，确保 `gen-schema --check` 全绿。

---

### D2: `spec-parsing` — 原生 Gherkin `场景大纲:` / `例子:` IR 扩展（`packages/core/src/spec/`）

#### 1) IR 数据结构扩展（`packages/core/src/spec/ir.ts` & `parser.ts`）
在 `packages/core/src/spec/ir.ts` 中新增 `ExamplesBlockIR` 并扩展 `ScenarioIR`（零 Tag 字段）：

```ts
export interface ExamplesBlockIR {
  name: string;
  /** Trimmed header column names, e.g. ['from', 'event', 'to']. */
  headers: string[];
  /** Each row is a list of trimmed cell values aligned with `headers`. */
  rows: string[][];
}

export interface ScenarioIR {
  name: string;
  tags: string[];
  runnable: boolean;
  stepCount: number;
  steps: ScenarioStep[];
  statement: string;
  /** True when the scenario has at least one Examples/例子 block or uses Scenario Outline/场景大纲 keyword. */
  isOutline?: boolean;
  /** Parsed Examples/例子 blocks attached to this scenario. */
  examples?: ExamplesBlockIR[];
}
```

- **`ruleHasRunnableScenario(rule)` 兼容性**：含步骤且非 `@skip` 的 `场景大纲:`（当 `examples` 非空且至少有一行数据）保持 `runnable === true`。若 `场景大纲:` 声明了 `examples` 但所有 `examples` 的 `rows` 均为空（0 行数据），则 `runnable === false`。

#### 3) `tests/bdd/runner.ts` 原生支持 `场景大纲:` (`Scenario Outline`) 行展开
在 `tests/bdd/runner.ts` 的 `runFeature()` 中：
- 当 `scenario.examples` 存在且非空时：
  - 遍历每个 `examples` 块，读取 `headers = examples.tableHeader?.cells.map(c => c.value.trim()) ?? []`；
  - 遍历 `examples.tableBody` 的每一行 `row`（构造 `colMap: Record<string, string>`）：
    - 将每个 `step.text`（以及 `step.docString?.content`）中的 `<colName>` 占位符替换为对应单元格的值；
    - 生成独立的 `test(\`${scenario.name} [${rowIndex + 1}: ${cells.join(', ')}]\`, ...)` 用例并执行。

---

### D3: `validation` — 自动发现与 XState 4 道零逃逸 `ERROR` 状态流转验证引擎（`packages/core/src/validation/transitions.ts`）

#### 1) 状态流转表 100% 自动发现规则（Auto-Discovery Heuristics）
当 `specs.check_transitions === true` 时，`validateCapability` 遍历每条 `RuleIR` 下的每个 `ScenarioIR`：
- 定义标准状态流转列集合（大小写不敏感）：
  - 起点列 `FROM_HEADERS = {'from', '初始状态'}`
  - 事件列 `EVENT_HEADERS = {'event', '事件'}`
  - 终点列 `TO_HEADERS = {'to', '目标状态'}`
  - 可选守卫列 `GUARD_HEADERS = {'guard', '守卫'}`
- **何时自动识别为状态流转表（`isTransitionOutline(sc)`）**：
  只要 `sc.examples` 中存在任意一个表块，其表头满足以下任一特征（即至少命中 `[from, event, to]` 三类中的 **两类**，从而连“漏写一列的残缺状态表”也一并捕获）：
  1. 同时含 `from` 类列与 `to` 类列（无论是否漏写 `event` 列）；
  2. 同时含 `from` 类列与 `event` 类列，或同时含 `event` 类列与 `to` 类列。
  （普通业务数据表如果没有状态起止/事件列对，不会被误伤；而一旦写了状态流转特征列但漏了某列，会被自动捕获并进入 Gate E1 报错！）

#### 2) 4 道不可绕过的 `ERROR` 门禁明细与 Issue Anchor

所有状态流转校验产生的 `ValidationItem` 级别一律为 `'ERROR'`，挂载路径（`id`）统一为 `${cap}/transitions/${rule.reqId || rule.title}`：

- **Gate E1 — 表结构完整与步骤占位符强制绑定门禁（Table & Step Placeholder Gate）**：
  - 触发条件 A（表结构残缺或不可运行）：`!sc.runnable`、缺少完整的 `[from, event, to]`（或 `[初始状态, 事件, 目标状态]`）三列、有效数据行数 `< 1`、存在空单元格（`from`/`event`/`to` 任一为空串）、或去重后的状态总数 `< 2`。
    - 错误消息：`transition scenario \`${sc.name}\` requires a runnable non-empty Examples table with columns [from, event, to] and at least 2 distinct states`
  - 触发条件 B（假步骤逃逸）：检查 `sc.steps`：
    - 必须包含 `given` 步且其文本引用了 `<from>`（或实际表头名如 `<初始状态>`）；若表头含 `guard`/`守卫` 列，`given` 或 `when` 步必须引用 `<guard>`/`<守卫>`；
    - 必须包含 `when` 步且其文本引用了 `<event>`/`<事件>`；
    - 必须包含 `then` 步且其文本引用了 `<to>`/`<目标状态>`。
    - 错误消息：`transition scenario \`${sc.name}\` steps must bind placeholders <from> in Given, <event> in When, and <to> in Then`

- **Gate E2 — XState 确定性门禁（Determinism Gate）**：
  - 触发条件：同一 `(from, event, guard ?? '')` 组合在表中出现多次（无论指向相同还是不同的 `to` 状态）。
  - 错误消息：`non-deterministic or duplicate transition in \`${sc.name}\`: state \`${from}\` on event \`${event}\`${guard ? ` [${guard}]` : ''} has conflicting targets`

- **Gate E3 — XState 构建与孤岛/不可达状态门禁（XState Machine & Reachability Gate）**：
  - 使用 `xstate` 的 `createMachine` 将转移表构造为状态机（初始状态 `initial` = 第一行数据的 `from` 状态，所有出现的 `from` 与 `to` 状态注册到 `states`），并使用 `@statelyai/graph` 从 `initial` 出发遍历可达状态集 `reachableStates`。
  - 触发条件：存在任何声明状态 $S \notin \text{reachableStates}$。
  - 错误消息：`unreachable state(s) in transition table \`${sc.name}\` from initial state \`${initial}\`: ${unreachable.join(', ')}`

- **Gate E4 — XState 死锁/陷阱门禁（Deadlock / Sink Gate）**：
  - 终态（Terminal States）定义：在有向转移图中出度为 0 的叶子状态（Leaf States，例如 `full` 或 `archived`）；若所有状态均有出边（纯循环状态机），则要求所有状态强连通，且严禁某状态仅有一条指向自身的自环 `S -> S` 而无任何通向外部的出边。
  - 触发条件：
    1. 某状态仅有指向自身的自环（`from === to`）且无其他出边构成死陷阱；
    2. 图存在至少一个终态（出度为 0 的叶子状态），但存在某个非终态节点 $S$ 从 $S$ 出发无法到达任何一个终态（陷入局部死循环强连通分量）。
  - 错误消息：`deadlock state(s) in transition table \`${sc.name}\` (cannot reach any terminal state): ${deadlocks.join(', ')}`

#### 3) 接入 `validateCapability` / `validateAllSpecs` 与 CLI `validate` / `review`
- 在 `packages/core/src/validation/validate.ts` 的 `validateCapability` 与 `validateAllSpecs` 的 `opts` 参数中增加可选 `checkTransitions?: boolean`。
- 在 `apps/cli/src/commands/validate.ts` 与 `apps/cli/src/commands/review.ts` 中读取 `Boolean(loadCliConfig()?.specs?.check_transitions)` 并传入。

---

### D4: 本仓库自举（Dogfooding on `change-lifecycle.feature` `@req:r34`）

1. 在本仓库 `llmanspec/config.yaml` 中开启单行布尔配置：
   ```yaml
   specs:
     check_command: "bun test tests/bdd"
     check_transitions: true
   ```
2. `llmanspec/specs/change-lifecycle.feature` 的 `@req:r34`（`规则: stage 单调推断规则`）下的 `场景大纲: stage 状态机单调迁移表` 会被 `check_transitions: true` **自动发现**并通过 XState 4 道门禁与 BDD 行展开测试。
