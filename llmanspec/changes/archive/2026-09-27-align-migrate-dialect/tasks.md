# Tasks

测试边界(seam):复用既有 harness——单测 seam 为 `migrateNativeSource()`/`analyzeLegacy()` 纯函数(tests/unit/spec.test.ts 既有 describe),BDD seam 为 steps/parse.ts 既有模式(含 change A 已绑定的 when 步骤「迁移该 feature 为原生格式」),不引入新 seam。

- [x] t1: `analyzeLegacy()` 返回结构携带源方言 `language`,`migrateNativeSource()` 按方言输出规则/场景关键字与自动嵌套场景标题(zh-CN → `规则:`/`场景:`/`验收示例` 不变;en → `Rule:`/`Scenario:`/`Acceptance example`),并在 tests/unit/spec.test.ts 补 en 方言 roundtrip 单测(输入 = issue #3 MVP:产物以 en 解析无错误、关键字为 en、步骤保留)与 zh-CN 回归断言(输出关键字仍为中文)
- [x] t2: 迁移产物解析自检:渲染完成后以官方解析器 re-parse,失败 → `ok:false` 且消息含解析错误(不产出可写内容,dry-run 同样受检);不可构造性说明见 design.md,不强行构造失败单测
- [x] t3: [blocked-by: t1, t2] specs r88 可执行场景落地 llmanspec/specs/spec-parsing.feature,tests/bdd/steps/parse.ts 绑定 en/zh 方言断言步骤,`bun test tests/bdd` 通过且 `just qa` 全绿
