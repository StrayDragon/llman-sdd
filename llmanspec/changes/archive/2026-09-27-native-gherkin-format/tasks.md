# 任务清单:native-gherkin-format

> 只列实现与验证任务;收口(`change finalize`)是流水线步骤,不列为任务。
> 大范围重构:按「引擎先立(原生可解析/可跑)→ 迁移工具 → 存量迁移 → 模板/测试 → 门禁」排序,分步保绿。

- [x] T1: IR 原生化——`spec/ir.ts` 引入 Rule{reqId,title,description,scenarios}/orphan 模型;parser 解除 `rule:nested-scenario` 拒绝、收集 Rule 描述与嵌套场景、@req 挂规则头、忽略(容忍)`@human/@rule/@executable/` 旧标签;引擎单测新增原生 fixture
- [x] T2: runner——展平 `规则:` 容器内的嵌套场景并执行;0 步骤场景跳过;`@skip/@experimental` 语义保留;移除 `onlyTagged:@executable` 依赖
- [x] T3: validate 结构性门——规则必带且全局唯一 @req(ERROR)、孤儿顶层场景(WARNING)、裸规则(无嵌套场景)聚合计数(INFO、不阻断 strict)、删除互斥/豁免/MUST 词/悬空链接旧门
- [x] T4: review/report/context/authoring/nextReqId/骨架/shape 适配原生关系(pending=裸规则聚合、orphan=顶层场景、resolve-req/add-req/add-scenario 改操作 规则: 块)
- [x] T5: 迁移工具 `spec migrate-native`——交互式 + `--dry-run`,旧标签轨→原生轨(规则→`规则:`块、验收按 @req 嵌套、剥除 @executable/@human/@rule、保留 @skip/@experimental、孤儿置于规则之前保持顶层身份),含单测
- [x] T6: 存量 13 个 spec 文件迁移(工具产出 + 结构校验 13/13)+ 提交
- [x] T7: 模板/skills——feature-contract/validation-hints/propose/apply/verify 全量原生样式;golden 重生成;`init --update` 刷新 `.agents/skills`
- [x] T8: 测试夹具全套适配(unit/bdd/integration,444 用例全绿)+ `scripts/pending-baseline.json` + `llmanspec/AGENTS.md` 过时条目更新
- [x] T9: 全量门禁——`just qa` 全绿 + `validate --specs --strict`(13/13)+ `validate <id> --strict` 待 reviewer 复核后绿 + `review` criticalCount=0 + 迁移语义核验
