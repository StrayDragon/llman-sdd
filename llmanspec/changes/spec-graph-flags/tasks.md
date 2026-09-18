# Tasks

测试接缝(seam):复用既有 seam——graphMermaid 纯函数(假 io,单测)与 CLI 子进程(BDD steps),不发明新 seam。

- [ ] T1: 单测先行(红)——scope 四态(active/archived/all/逗号组合)、depth BFS 展开(深度截断)、种子 change 可达性、next-req-id --json、skeleton --force 覆盖/无 force 报已存在 [blocked-by: 无]
- [ ] T2: 实现(绿)——graph 收集阶段按 scope/depth 过滤;specHelpers 两 flag;CLI 注册 [blocked-by: T1]
- [ ] T3: BDD 场景落地(红)——`peripheral-commands.feature` 增 `@req:r54 @executable`(--scope archived 仅归档子图)与 `@req:r55 @executable`(skeleton --force 往返)场景,steps 补齐 [blocked-by: T2]
- [ ] T4: 门禁全绿——`bun run qa`;v1 二进制对拍:--scope all 同 fixture 节点集合一致 [blocked-by: T3]
