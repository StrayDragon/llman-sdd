# Tasks

测试接缝(seam):复用既有 seam——parser/validate/review 纯函数单测(fixture 字符串)、BDD steps(真实工作区)、`/tmp/llman-sdd-repros/mvp{1,2}` 端到端脚本,不发明新 seam。

- [ ] T1: Specs landing——绑定分支上编辑 live specs:spec-parsing r9(删「@manual 必须与 @human 同用」,改为「残留 @manual MUST 报迁移 ERROR」)、validation r12(「@manual 无 @human MUST 判 ERROR」改为「残留 @manual MUST 判 ERROR」)、review-freeze r23(kind 集合删 manual,六种→五种)与 r33(四类→三类信号),commit [blocked-by: 无]
- [ ] T2: parser 移除 manual——classify() 删 manual 字段与 tag:manual-orphan 检查,残留 @manual 报 ERROR(code `tag:manual-removed`,文案含 0.3.0 迁移指引);ir.ts 删 ScenarioIR.manual;spec.test.ts 改断言(@manual → ERROR 非静默) [blocked-by: T1]
- [ ] T3: validate/review/report 口径收敛——validate.ts:183 INFO 文案去 waiver 从句;review.ts 删 'manual' kind/L68/L73/L134 迭代;report/specs.ts 删 ruleManualCount 字段与 list 文本列;main.ts:908-911 删内联文本嗅探 ruleManualCount;bdd steps kind 迭代删 manual;相关单测调整 [blocked-by: T2]
- [ ] T4: 模板与 golden——en/zh-Hans validation-hints.md 删 `@manual` 行、feature-contract.md 覆盖三态改两态;golden:generate 重渲染基线;本仓 .agents/skills 重渲染同步 [blocked-by: T3]
- [ ] T5: 发布收尾——migrations/v0.2-v0.3/(README prompt + 检查脚本)、三处 package.json 0.3.0、新建 CHANGELOG.md(迁移说明);MVP-1/MVP-2 复现脚本改为断言修复后行为并跑绿 [blocked-by: T4]
- [ ] T6: 门禁全绿——`just qa`、`llman-sdd validate --all --strict --no-interactive`、`just golden` [blocked-by: T5]
