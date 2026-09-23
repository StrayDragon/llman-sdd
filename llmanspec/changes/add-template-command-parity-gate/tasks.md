# Tasks

测试接缝(seam):全复用既有通道——对账测试用 spawnSync 驱动源码 CLI(tests/integration/binary.test.ts 既有模式);@executable 场景复用 tests/bdd runner 既有 smoke steps(执行命令/退出码);qa 纳入靠 tests/unit 既有收编,不发明新 seam。

- [ ] T1: Specs landing——monorepo-structure.feature 新增 r67(@human:模板命令引用 MUST 与 CLI 命令面对账且门禁随 bun test 运行;@executable:场景跑对账测试退出码 0),绑定分支 commit [blocked-by: 无]
- [ ] T2: 对账测试落地——新增 tests/unit/template-command-parity.test.ts(扫描→探测→违例清单断言);本地 `bun test tests/unit/template-command-parity.test.ts` 过;故意注入一个坏引用验证门禁真红后还原 [blocked-by: T1]
- [ ] T3: 全门禁——`just qa`、`just golden`、`validate --all --strict`、review 全绿;`llman-sdd show` readyToImplement 确认 [blocked-by: T2]
- [ ] T4: 收口——finalize 归档(squash 自动提交) [blocked-by: T3]
