# Tasks

测试接缝(seam):复用既有 seam——buildReqRegistry/parseCapability 纯函数(临时 specs 目录,单测)与 CLI 子进程(BDD steps),不发明新 seam。

- [x] T1: 单测先行(红)——add-req:重复 rN 拒绝、无语义词拒绝、追加后可被 parseCapability 解析且注册表收录;add-scenario:挂靠不存在 req 拒绝、追加后该 req 获得验收场景;resolve-req 命中/未命中;dedupe:冲突重映射计划与 --dry-run 零副作用 [blocked-by: 无]
- [x] T2: 实现(绿)——core specHelpers 增 addReq/addScenario/resolveReq/dedupeReqIds;CLI 注册四命令(add-requirement 别名) [blocked-by: T1]
- [x] T3: BDD 场景落地(红)——`spec-authoring.feature` 增 @executable 场景(追加-解析-注册表闭环、dedupe 往返),steps 补齐 [blocked-by: T2]
- [x] T4: 门禁全绿——`bun run qa`;v1 二进制对拍:同 fixture 下 add-req 产物结构(@req/@human 行布局)与 resolve-req 输出字段一致 [blocked-by: T3]
