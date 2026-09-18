# Tasks

测试接缝(seam):复用既有 seam——freeze/context 域函数(临时工作区,单测)与 CLI 子进程(BDD steps),不发明新 seam。

- [x] T1: 单测先行(红)——thaw --dest 指定目录(自动创建)与缺省不变;backend 三态(pageindex 接受/rag 报错文案/缺省兜底 env);max-scan-depth 边界(0 报错、嵌套 proposal 在深度内/外被扫描) [blocked-by: 无]
- [x] T2: 实现(绿)——三处落点;program 级全局选项注册 [blocked-by: T1]
- [x] T3: BDD 场景落地(红)——`review-freeze.feature` 增 `@req:r56 @executable`、`context-index.feature` 增 `@req:r57 @executable`、`peripheral-commands.feature` 增 `@req:r58 @executable` 场景,steps 补齐 [blocked-by: T2]
- [x] T4: 门禁全绿——`bun run qa`;v1 二进制对拍:thaw --dest 落点、--backend rag 报错语义一致 [blocked-by: T3]
