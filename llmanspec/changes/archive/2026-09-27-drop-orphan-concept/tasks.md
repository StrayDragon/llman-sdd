# 任务清单:drop-orphan-concept

> 只列实现与验证任务;收口(`change finalize`)是流水线步骤,不列为任务。

- [x] T1: 引擎——validate 删除孤儿 WARNING;review 删除 unbound 信号(kind/push/行渲染/HTML 契约);morphology 字段 orphanAcceptanceCount → featureScenarioCount
- [x] T2: 引擎——migrate-native 移除无归验收前置保序(自然顺序产出);IR `orphans` 注释更新为功能级示例(无告警语义)
- [x] T3: specs 合约——validation r12/r65(删除 r65 节)、review-freeze r23(删 unbound)、peripheral r20/r21(字段更名)、spec-parsing r9(功能级示例说明)
- [x] T4: 模板/golden/skills 移除孤儿表述 + init --update + 重生成
- [x] T5: 测试更新(孤儿断言 → featureScenarioCount/无告警;review unbound 用例删除;迁移用例改自然顺序)+ `just qa` 全绿 + `validate --specs --strict` + `validate <id>` + `review` + AGENTS.md/migrations 文档同步
