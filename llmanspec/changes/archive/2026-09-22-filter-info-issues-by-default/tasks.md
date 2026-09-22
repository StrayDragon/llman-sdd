# Tasks

测试接缝(seam):复用既有 seam——BDD steps(临时仓库 + spawn CLI,`tests/bdd/steps/domain.ts` 既有 r47/r48 模式),不发明新 seam。

- [x] T1: Specs landing——绑定分支编辑 `llmanspec/specs/validation.feature`:新增 r32 @human 规则(INFO 缺省过滤/`--include-info` 恢复/不影响 valid 与退出码)与 @executable 验收场景,commit [blocked-by: 无]
- [x] T2: BDD steps 先行(红)——domain.ts 增 r32 场景 steps(pending 规则 fixture 仓库、两态 validate --json 运行、断言差集恰为 INFO 且 valid 一致);`bun test tests/bdd` 红于缺实现 [blocked-by: T1]
- [x] T3: 实现(绿)——main.ts validate action 增 `--include-info` flag,items 构建后统一过滤 INFO;`bun test tests/bdd` 绿 [blocked-by: T2]
- [x] T4: 门禁 + 实测——`just qa`、`just golden`、`validate --all --strict`;xylitol 实测 `validate --all --json` 行数下降与 `--include-info` 恢复 [blocked-by: T3]
