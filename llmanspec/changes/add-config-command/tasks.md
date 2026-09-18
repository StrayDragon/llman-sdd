# Tasks

测试接缝(seam):复用既有 seam——core config 纯函数(临时 config.yaml,单测)与 CLI 子进程(BDD steps),不发明新 seam。

- [ ] T1: 单测先行(红)——概览渲染五要素(bdd on/off 两态、archive 缺省/定制两态);--set/--unset 增删后注释与 $schema 头保留;白名单外名字报错 [blocked-by: 无]
- [ ] T2: 实现(绿)——core `configOverview` / `setExtraSkills`;CLI 注册 `config` 与 `config skills`(--json/--set/--unset) [blocked-by: T1]
- [ ] T3: BDD 场景落地(红)——`config-command.feature` 增 `@req:r37 @executable`(概览要素齐全且只读)与 `@req:r38 @executable`(set/unset 往返)场景,steps 补齐 [blocked-by: T2]
- [ ] T4: 门禁全绿——`bun run qa` + `bun run check:schema`;v1 二进制对拍 config 概览五要素口径与 config skills --json 形状 [blocked-by: T3]
