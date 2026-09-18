# Tasks

测试接缝(seam):复用既有 seam——loadConfig/deriveId 纯函数(单测)与 CLI 子进程(BDD steps),不发明新 seam。

- [x] T1: 单测先行(红)——pattern:非法正则加载报错、显式/派生 id 违规拒绝、缺省宽松通过;template:四内置变量、未定义变量 Strict 报错、渲染结果过 pattern、无 template 时启发式派生不变 [blocked-by: 无]
- [x] T2: 实现(绿)——config 加载期编译 pattern;new 链路接 template 渲染(nunjucks Strict 环境);validate 增 pattern ERROR 判定 [blocked-by: T1]
- [x] T3: BDD 场景落地(红)——`config-schema.feature` 增 `@req:r59 @executable`、`change-lifecycle.feature` 增 `@req:r60 @executable` 场景,steps 补齐 [blocked-by: T2]
- [x] T4: 门禁全绿——`bun run qa` + `bun run check:schema`;v1 二进制对拍:同 template/pattern fixture 下派生 id 一致 [blocked-by: T3]
