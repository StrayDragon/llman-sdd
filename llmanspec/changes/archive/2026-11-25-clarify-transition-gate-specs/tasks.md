# Tasks: clarify-transition-gate-specs

验收缝沿用现有 CLI：`validate --specs --json` 与 `list --json`。不新增命令。

- [x] T1: 拆开 validation 的状态流转规则并绑定步骤 (`@req:r104`, `@req:r124`, `@req:r125`, `@req:r126`, `@req:r127`)
  - `llmanspec/specs/validation.feature`：r104 只写 tag 定界；新增四条短规则，每条场景一个断言。
  - `tests/bdd/steps/validation.ts`：按场景准备临时仓库。通过路径断言 capability 有效且无 `/transitions/` ERROR；失败路径复用已有「含指定文本的 ERROR」与「退出码非零」。
  - 例子覆盖：豁免孤岛、强制残缺列、双 tag、无 tag 孤岛、缺列、未绑定步骤、空单元格、单状态、中文列名合法表、中文缺列、未绑定守卫、冲突目标、重复行、不同守卫、孤岛、到不了终态、单向环、自环吸收态、合法纯环。

- [x] T2: 把 stage 例子表改成文件组合 (`@req:r34`) [blocked-by: T1]
  - `llmanspec/specs/change-lifecycle.feature`：删除 `from/event/to` 迁移大纲，改为 design/tasks/binding → stage 的八行例子，与 `stageFor` 一致。
  - `tests/bdd/steps/lifecycle.ts`：给定步骤按三个单元格写 proposal、design.md、tasks.md；绑定用 frontmatter 三键。查询仍走 `运行 list --json`。

- [x] T3: 去掉不参与判定的 xstate 调用 (`@req:r124`) [blocked-by: T1]
  - `packages/core/src/validation/xstateTransitions.ts`：删除 `createMachine` 与 `parseTransitionExpr`。图遍历保持 `@statelyai/graph`。文件名不改。
  - `packages/core/package.json`：移除直接依赖 `xstate`，并更新锁文件。
  - `tests/unit/transitions.test.ts` 保持现有判定用例，不删测试。
