# Tasks

测试边界(seam):`packages/core` report/graph 纯函数(单元)+ 活体 golden 对照脚本(本仓库 v1 ↔ v2)+ BDD `@executable` 驱动 CLI。

- [ ] T1 core report:collectChanges(阶段判定/任务计数/status 枚举)+ list 人读/JSON 渲染 + 单元测试
- [ ] T2 graph:mermaid 生成(sanitize/archived 标注/depends_on 边)+ 单元测试
- [ ] T3 show:`show change --output json`(gateChecks 结构对齐)+ `show spec` 文本直出
- [ ] T4 spec 助手与引导壳:`spec skeleton/next-req-id` + `project migrate` 引导文案
- [ ] T5 CLI 接线 + 活体 golden:`tests/golden/check-cli.ts`(归一化后 v1 ↔ v2 结构一致)+ BDD `@executable`
