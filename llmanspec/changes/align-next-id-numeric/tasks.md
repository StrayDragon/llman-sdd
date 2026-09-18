# Tasks

测试接缝(seam):复用既有 seam——core 纯函数(假 io/临时目录,单测)与 CLI 子进程(BDD steps),不发明新 seam。

- [ ] T1: 单测先行(红)——nextFreeNumber:空树(null/1)、扁平编号、嵌套+归档混合取 max、非编号目录忽略 [blocked-by: 无]
- [ ] T2: 实现(绿)——core util + next-id CLI 改写(去 --from 必填、加 --json) [blocked-by: T1]
- [ ] T3: change new --dry-run——派生预览单测(输出 id、零文件创建)+实现 [blocked-by: T2]
- [ ] T4: BDD 场景落地(红)——`change-lifecycle.feature` 增 `@req:r35 @executable`(编号计数)与 `@req:r36 @executable`(dry-run 零副作用)场景,steps 补齐 [blocked-by: T3]
- [ ] T5: 门禁全绿——`bun run qa`;v1 二进制对拍 next-id 人读与 --json 字段、change new --dry-run 输出一致 [blocked-by: T4]
