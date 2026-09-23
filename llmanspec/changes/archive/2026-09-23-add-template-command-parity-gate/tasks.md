# Tasks

测试接缝(seam):全复用既有通道——对账测试用 spawnSync 驱动源码 CLI(tests/integration/binary.test.ts 既有模式);@executable 场景复用 tests/bdd runner 既有 smoke steps(执行命令/退出码);qa 纳入靠 tests/unit 既有收编,不发明新 seam。

- [x] T1: Specs landing——monorepo-structure.feature 新增 r67(@human:模板命令引用 MUST 与 CLI 命令面对账且门禁随 bun test 运行;@executable:场景跑对账测试退出码 0),绑定分支 commit [blocked-by: 无]
- [x] T2: 对账测试落地——新增 tests/unit/template-command-parity.test.ts(扫描→探测→违例清单断言);本地 `bun test tests/unit/template-command-parity.test.ts` 过;故意注入一个坏引用验证门禁真红后还原 [blocked-by: T1]
  <!-- 实施 batch:测试落地即抓到 2 处人工审计漏网——全局旗标 --no-interactive 误报(改为顶层 help 白名单)与孤儿 unit migrate-prompt(zh/en)残留 project migrate --kind(按用户指令整体删除) -->
- [x] T3: 全门禁——`just qa`、`just golden`、`validate --all --strict`、review 全绿;`llman-sdd show` readyToImplement 确认 [blocked-by: T2]
  <!-- 偏差记录:`validate --all --strict` 因 migrate-prompt 删除触发 init-generators STALE(WARNING 经 strict 升级),属模板改动必然信号;人工复核 golden 字节等价(渲染面零变化)后接受,finalize 门 = change 级 strict + r40 全绿;合并后 main 上该门恢复全绿 -->
- [x] T4: 收口——finalize 归档(squash 自动提交) [blocked-by: T3]
  <!-- T4 于 finalize 前勾选:任务本体即"运行 finalize",r40 门要求勾选才能归档(先勾后跑,语义由 finalize 完成闭环) -->
