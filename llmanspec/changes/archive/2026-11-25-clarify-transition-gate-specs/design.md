# Design: 状态流转门禁拆句与 stage 文件组合

## D1 规则拆分，不改判定

tag 次序留在 `@req:r104`：双 tag 冲突 → `@no-transitions` 整表跳过 → `@transitions` 强制进入 → 无 tag 时三族列至少两族才纳入。

其后四道门禁各一条规则，issue 路径仍是 `<cap>/transitions/<req_id>`，命中即返回：

| 规则 | 门禁 | 消息片段 |
| --- | --- | --- |
| 结构与占位符 | 缺列、空表、空单元格、状态数 < 2、非 runnable；Given/When/Then 未绑定列占位符；有 guard 列时 Given 或 When 未绑定 | `requires a runnable non-empty Examples table` 或 `steps must bind placeholders` |
| 确定性 | 同一 `(from, event, guard)` 出现多于一次，不论目标是否相同 | `non-deterministic or duplicate transition` |
| 可达 | 从首行 `from` 走不出的状态 | `unreachable state` |
| 终态与回初态 | 有出度 0 的状态时，非终态必须能到达某一终态；没有终态时，其他状态必须能回到初始状态 | `cannot reach any terminal state` 或 `cannot return to the initial state` |

中文列名 `初始状态` / `事件` / `目标状态` / `守卫` 与英文列名同一套门禁。不同 guard 视为不同转移。

## D2 stage 是文件组合，不是事件机

`stageFor` 的顺序是：三者皆有 → `full`；有 design 与 tasks → `planned`；仅有 design → `designed`；其余 → `draft`。`hasBinding` 为 proposal frontmatter 同时解析出 `branch`、`base_branch`、`base_sha`。

例子表列名用 `design` / `tasks` / `binding` / `stage`，避免再被状态流转嗅探当成 `from/event/to` 表。已有的 tasks-only 场景和四阶段场景保留，它们分别钉住「只有 tasks.md」和「proposal 不写 stage 字段」。

## D3 引擎只留真正走图的库

删除 `createMachine` 的空 catch 和 `parseTransitionExpr`。`@statelyai/graph` 的 BFS 与 `hasPath` 继续负责可达和回边。文件名 `xstateTransitions.ts` 保留，避免并行笔记里的路径引用失效。`TRANSITIONS_INTROSPECTION` 文案不动。
