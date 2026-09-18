# Tasks

测试接缝(seam):复用既有 seam——`buildReview`(临时 specs 目录 fixture,单测)与 BDD steps(真实工作区/临时仓库),不发明新 seam。

- [x] T1: 单测先行(红)——双 capability specs fixture 下 buildReview(io, {capability: "a"}) 仅返回 a 的四类信号,locked/validate 仍全局;无过滤入参时全量 [blocked-by: 无]
- [x] T2: 实现(绿)——buildReview 增加可选 capability 参数并在四类信号收集处过滤;main.ts action 传参 [blocked-by: T1]
- [x] T3: BDD 场景落地(红)——`review-freeze.feature` 增 `@req:r33 @executable` 场景(--capability 过滤后 signals 不含其它 capability 条目),steps 补齐 [blocked-by: T2]
- [x] T4: 门禁全绿——`bun run qa`;v1 二进制对拍 `review --capability` 过滤口径一致 [blocked-by: T3]
