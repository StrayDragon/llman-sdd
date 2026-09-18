# Tasks

测试接缝(seam):复用既有 seam——core 生命周期域函数(临时 git 仓库 fixture,单测)与 BDD steps(spawn CLI),不发明新 seam。

- [x] T1: 单测先行(红)——任务门禁矩阵:未勾任务默认 Warning 放行、strict_defer=true 拦截、min_completion_ratio=0.5 两种完成率、--force 全跳、--dry-run 零副作用;git 门四条(绑定/在绑定分支/非默认/clean)各自报错 [blocked-by: 无]
- [x] T2: 实现(绿)——从 finalize 抽取合并+改名+提交共用实现;新增 archiveCommand(门禁→合并→改名→提交);CLI 注册(hidden --force) [blocked-by: T1]
- [x] T3: BDD 场景落地(红)——`change-lifecycle.feature` 增 `@req:r39 @executable`(收口全链路)与 `@req:r40 @executable`(未勾任务被拦、--force 放行)场景,steps 补齐 [blocked-by: T2]
- [x] T4: 门禁全绿——`bun run qa`;v1 二进制对拍:同 fixture 下 change archive 门禁行为与归档终态一致(archive 目录名、提交信息) [blocked-by: T3]
