# Tasks

测试边界(seam):复用既有 harness——单测 seam 为 `migrateNativeSource()` 纯函数(tests/unit/spec.test.ts 既有 describe),BDD seam 为 steps/parse.ts 既有模式(步骤代码驱动 `@llman-sdd/core` 公共 API),不引入新 seam。

- [x] t1: `migrateNativeSource()` 渲染规则块时,把该 legacy 规则场景自身的 steps 合成为紧跟描述之后的自动嵌套 `场景: 验收示例`(关键字与文本原样保留、`@skip` 继承、计入 `scenarios` 返回计数),并在 tests/unit/spec.test.ts 补同体形态 roundtrip 单测(输入 = issue #2 MVP:断言嵌套场景存在、步骤关键字序列 `given/when/then` 原样、产物 re-parse 0 错误)
- [x] t2: [blocked-by: t1] specs r65 可执行场景落地 llmanspec/specs/spec-parsing.feature,tests/bdd/steps/parse.ts 绑定对应步骤(驱动 migrateNativeSource),`bun test tests/bdd` 通过且 `just qa` 全绿
