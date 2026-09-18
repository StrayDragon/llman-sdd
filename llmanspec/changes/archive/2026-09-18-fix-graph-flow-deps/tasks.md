# Tasks

测试接缝（seam）：复用既有两条 seam——`graphMermaid(io, root)` 纯函数（GraphFsIo 假 io，单测）与 CLI 子进程/真实工作区（BDD steps），不发明新 seam。

- [x] T1: 单测先行（红）——`tests/unit/report.test.ts` 增加 flow 风格用例：`depends_on: [a, b]` 单行、空 `depends_on: []`、块式与 flow 混用多 change、畸形 frontmatter（截断 yaml）四类 fixture，断言节点与 `-->|depends on|` 边 [blocked-by: 无]
- [x] T2: 实现（绿）——放宽 `parseDeps`：先匹配 `^depends_on:\s*\[(.*)\]\s*$` 拆分流式元素（trim、去空、去引号），未命中再走既有块式状态机；畸形输入返回空数组 [blocked-by: T1]
- [x] T3: BDD 场景落地（红）——`peripheral-commands.feature` 增 `@req:r30 @executable` 场景（流式 depends_on 指向 archived change 时节点与边均出现），`tests/bdd/steps/domain.ts` 补对应 step（临时仓库 + 直接调 core graphMermaid 或 spawn CLI） [blocked-by: T2]
- [x] T4: 门禁全绿——`bun run qa` + `just golden`；用 v1 二进制（../llman.old-rs-impl-sdd/target/debug/llmanspec）对拍同一流式 fixture 的 graph 输出节点/边集合一致 [blocked-by: T3]
