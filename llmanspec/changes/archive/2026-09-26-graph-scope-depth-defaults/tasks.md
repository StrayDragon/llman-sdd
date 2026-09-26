# Tasks

> Seam：所有断言走既有测试轮廓：
> - 纯域：直接调 `@llman-sdd/core` 的 `graphData`/`graphMermaid`（GraphFsIo 注入，mock 文件树）
> - CLI：`tests/helpers/spawn.ts runCli` + `tests/bdd/steps/peripheral.ts`（makeTempRepo）
> - 真实仓库：`--scope archived/all` 的节点数对比断言在 change 分支上测量

- [x] T1: `buildDefaultNodes` 增加 `depth` 参数——`depth=0` 仅返回 scope 节点（不拉缺失依赖）；`depth≥2` 从 scope 根 BFS 展开 N 层（复用依赖映射）；`depth=1` 保持现状一层拉取。（analysis.ts + 单元测试：0/1/2 三档节点集）
- [x] T2: `graphData`/`graphMermaid` 透传 `opts.depth`（缺省 1）到无种子分支——全图模式 `--depth` 不再被忽略。（graphData.ts/render.ts + 单元测试：同 repo 不同 depth 输出不同）
- [x] T3: CLI `--depth` 无种子路径生效——`graph --scope archived --depth 0/1/2` 节点数递减且不再静默忽略；`--depth` 非法值报错。（graph.ts + BDD/集成测试）
- [x] T4: 回归保护——缺省（无 depth）全图 = depth 1 = scope 节点 + 一层依赖；种子模式 depth 语义保持（现有测试不变）。（report.test.ts + 种子测试回归）
- [x] T5: BDD 场景更新——spec r54 新增全图 depth 语义的 @executable 场景与断言，`bun test tests/bdd` 全绿。（specs/peripheral-commands.feature + tests/bdd/steps/peripheral.ts）
- [x] T6: help/模板文案同步——`graph --help` 与 skills 模板的 depth 描述更新为「全图模式默认 1 层、--depth 0 仅 scope、N 递归」，`init --update` 刷新 `.agents/skills`，渲染门通过。
