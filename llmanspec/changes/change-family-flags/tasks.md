# Tasks

测试接缝(seam):复用既有 seam——core 生命周期域函数(临时 git 仓库 fixture,单测)与 BDD steps(spawn CLI),不发明新 seam。

- [ ] T1: 单测先行(红)——new --force 覆盖/无 force 报已存在、--verb 进派生;attach --force 重绑/--base 校验(存在且非当前);start 前缀三级取值序;finalize 默认 sweep 中止、--no-check 跳过、--no-commit 跳过自动提交、method 取值序;diff --json 字段与 --export-patch 落盘 [blocked-by: 无]
- [ ] T2: 实现(绿)——core 各门与取值序;finalize 接 validateAllSpecs+change 校验 sweep;CLI flag 注册 [blocked-by: T1]
- [ ] T3: BDD 场景落地(红)——`change-lifecycle.feature` 增 @req:r44/r45/r46 @executable 场景,steps 补齐 [blocked-by: T2]
- [ ] T4: 门禁全绿——`bun run qa`;v1 二进制对拍:finalize --no-commit 的终态(已改名未提交)与 diff --json 字段一致 [blocked-by: T3]
