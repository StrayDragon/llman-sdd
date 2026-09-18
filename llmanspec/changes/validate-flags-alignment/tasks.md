# Tasks

测试接缝(seam):复用既有 seam——validateAllSpecs/validateChange 纯函数(临时 specs/changes 目录,单测)与 CLI 子进程(BDD steps),不发明新 seam。

- [ ] T1: 单测先行(红)——item 消歧(spec 命中/change 命中/双义报错)、--all 聚合、--stage 四档门、--strict WARNING 非零、--json/compact 结构、run_command 占位符三态(有占位符逐项/无占位符 batch-once) [blocked-by: 无]
- [ ] T2: 实现(绿)——CLI flag 面重写;core 增 validateChange(按 v1 change 文档规则);占位符替换器 [blocked-by: T1]
- [ ] T3: BDD 场景落地(红)——`validation.feature` 增 `@req:r47 @executable`(消歧+strict)与 `@req:r48 @executable`(占位符替换)场景,steps 补齐 [blocked-by: T2]
- [ ] T4: 门禁全绿——`bun run qa`;v1 二进制对拍:同 fixture 下 --json items[].{id,type,valid} 与 --strict 退出码一致 [blocked-by: T3]
