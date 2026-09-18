# Tasks

测试接缝(seam):复用既有 seam——collect/show 纯函数(临时工作区 fixture,单测)与 CLI 子进程(BDD steps),不发明新 seam。

- [ ] T1: 单测先行(红)——list 两种排序与 compact-json 形状;show 文本段结构(Stage/path/frontmatter);What Changes 门(json 同样生效);-r 边界(N 越界报错);三种 --output 修饰;deltas/reqs-only 报错文案 [blocked-by: 无]
- [ ] T2: 实现(绿)——CLI flag 面与 core 渲染函数;What Changes 门实现 [blocked-by: T1]
- [ ] T3: BDD 场景落地(红)——`peripheral-commands.feature` 增 @req:r51/r52/r53 @executable 场景,steps 补齐 [blocked-by: T2]
- [ ] T4: 门禁全绿——`bun run qa`;v1 二进制对拍:show 文本段布局、list --sort name 顺序一致 [blocked-by: T3]
