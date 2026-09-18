# Tasks

测试接缝(seam):复用既有 seam——collectChanges/SpecSummary 纯函数(临时目录 fixture,单测)与 BDD steps,不发明新 seam。

- [x] T1: 单测先行(红)——四档矩阵:仅 proposal=draft、+design=designed、design+tasks=planned、+binding=full、仅 proposal+tasks(无 design)=draft [blocked-by: 无]
- [x] T2: 实现(绿)——collect.ts stage 判定改单调规则,与 r34 合约一致 [blocked-by: T1]
- [x] T3: BDD 场景落地(红)——`change-lifecycle.feature` 增 `@req:r34 @executable` 场景(tasks-only change 的 list stage 为 draft),steps 补齐 [blocked-by: T2]
- [x] T4: 门禁全绿——`bun run qa`;v1 二进制对拍同一 fixture 的 list --json stage 值一致 [blocked-by: T3]
