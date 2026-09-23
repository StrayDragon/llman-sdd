# Tasks: add-module-dependency-gate

- [ ] T1: Specs landing——monorepo-structure.feature 新增 r72(跨模块导入对账)@human 规则与配对 @executable 验收场景;绑定分支上 commit。
- [ ] T2: 新增 `tests/unit/module-dependency-parity.test.ts`:文件级导入解析 → 顶层模块边集 vs 声明允许表(barrel 豁免、type 同权、违例与表漂移双向报出);用当前实测边集填表验证零违例。 [blocked-by: T1]
- [ ] T3: 全量验收:`just qa` + `validate --all --strict` + `review` 全绿(无模板改动,golden 不涉及)。 [blocked-by: T2]
