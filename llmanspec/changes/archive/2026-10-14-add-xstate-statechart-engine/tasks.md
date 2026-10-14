# Tasks: add-xstate-statechart-engine

- [x] T1: 扩展 `config-schema` 支持 `specs.check_transitions` 布尔开关与 Schema 生成 (`@req:r102`)
  - 在 `packages/core/src/config/schema.ts` 的 `specsSchema` 中将状态流转配置定义为单行可选布尔字段 `check_transitions: z.boolean().nullish()`，并更新 `llmanspec/specs/config-schema.feature` `@req:r5` 的字段枚举描述。
  - 运行 `bun run scripts/gen-schema.ts` 刷新 `artifacts/schema/configs/en/llmanspec-config.schema.json`。
  - 在 `tests/bdd/steps/config.ts` 与 `tests/unit/config.test.ts` 更新 `@req:r102` 的 BDD 步骤绑定与单元测试，验证 `bun test tests/bdd -t "check_transitions"` 与 `bun run scripts/gen-schema.ts --check` 通过。

- [x] T2: 扩展 `spec-parsing` 与 `tests/bdd/runner.ts` 原生支持 Gherkin `场景大纲:` 与 `例子:` 行展开 (`@req:r103`) [blocked-by: T1]
  - 在 `packages/core/src/spec/ir.ts` 与 `packages/core/src/spec/parser.ts` 中为 `ScenarioIR` 增加 `isOutline` 与 `examples: ExamplesBlockIR[]`（纯解析 `tableHeader` 与 `tableBody`，零 Tag 字段），并确保空 `examples` 表不计入 `runnable`。
  - 在 `tests/bdd/runner.ts` 中实现 `scenario.examples` 行展开：将步骤文本与 DocString 中的 `<col>` 占位符按行替换并注册为独立 `bun:test` 用例。
  - 在 `tests/bdd/steps/parse.ts` 补齐 `@req:r103` 的 BDD 步骤与断言，验证 `bun test tests/bdd -t "场景大纲"` 通过。

- [x] T3: 基于 `xstate` / `@statelyai/graph` 实现全自动发现与 4 道零逃逸 `ERROR` 状态流转验证引擎 (`@req:r104`) [blocked-by: T1, T2]
  - 在 `packages/core/src/validation/transitions.ts` 实现 100% 自动发现（凡 `例子:` 表头含 `from/to`、`初始状态/目标状态`，或含 `event/事件` 与其一即自动纳管，捕获漏列残缺表），并覆盖 E1（必填列 `[from, event, to]`、行数/状态数、`runnable` 与步骤 `<from>`/`<event>`/`<to>` 占位符绑定）、E2（非确定性/重复转移检测）、E3（孤岛/不可达状态检测）、E4（死锁/陷阱状态检测）共 4 道 `ERROR` 门禁（错误锚点统一为 `<cap>/transitions/<req_id>`）。
  - 在 `packages/core/src/validation/validate.ts`、`packages/core/src/review/review.ts`、`apps/cli/src/commands/validate.ts` 与 `apps/cli/src/commands/review.ts` 中透传 `checkTransitions: Boolean(config?.specs?.check_transitions)`。
  - 在 `tests/bdd/steps/validation.ts` 更新 `@req:r104` 的 BDD 步骤绑定，确保 4 道门禁自动发现并逐项触发 `ERROR`，且默认关闭时零影响。

- [x] T4: 移除冗余的 `spec add-transitions` 子命令与相关 authoring 代码，保持本仓 `change-lifecycle` (`@req:r34`) 自举闭环 [blocked-by: T2, T3]
  - 从 `apps/cli/src/commands/spec.ts`、`packages/core/src/spec/authoring.ts`、`packages/core/src/index.ts` 与 `tests/bdd/steps/spec-authoring.ts` 中移除 `spec add-transitions` / `addTransitionsScenario`；从 `llmanspec/specs/spec-authoring.feature` 删除 `@req:r105` 及对应场景（`keywords.ts` 的 `scenarioOutline`/`examples` 保留，供解析与 BDD 行展开使用）。
  - 确认本仓库 `llmanspec/config.yaml` 开启 `check_transitions: true` 且 `tests/bdd/steps/lifecycle.ts` 中 `change-lifecycle` `@req:r34` 的状态机大纲步骤正常运行，验证 `just qa` 与 `bun run apps/cli/src/main.ts validate --all --strict --check` 全绿。
