# Tasks

测试接缝(seam):复用既有 seam——runInit(临时目录,单测)与 CLI 子进程(BDD steps),不发明新 seam。

- [x] T1: 单测先行(红)——init 到不存在的一级/嵌套子目录(自动创建)、绝对路径、缺省 cwd;--lang 与 --locale 等效(zh-Hans 渲染一致);同给报错 [blocked-by: 无]
- [x] T2: 实现(绿)——CLI init 增位置参数与 --lang 别名(同给报错),root 透传 runInit [blocked-by: T1]
- [x] T3: BDD 场景落地(红)——`init-generators.feature` 增 `@req:r49 @executable`(子目录初始化产物面完整)与 `@req:r50 @executable`(--lang 等效)场景,steps 补齐 [blocked-by: T2]
- [x] T4: 门禁全绿——`bun run qa` + `just golden`;v1 二进制对拍:init <path> 产物树同构 [blocked-by: T3]
