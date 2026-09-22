# Tasks

测试接缝(seam):复用既有 seam——integration 临时仓库 + spawn CLI(`tests/integration/` 既有模式),不发明新 seam。

- [x] T1: integration 测试先行(红)——新增 `tests/integration/show-dirstyle.test.ts`:临时仓库写目录式 `specs/<cap>/<cap>.feature`,spawn CLI 断言 `show <cap>` 输出 `## Spec` 头与 `## Morphology` 尾节、`show <cap> --output json` 为合法 JSON 且 capability 字段命中、`show no-such --type spec` 报 `spec not found` 且 exit 1;另起扁平 specs 仓库回归断言输出不变 [blocked-by: 无]
- [x] T2: 实现(绿)——`main.ts` show action:isSpec 判定追加 loadSpecEntries 精确命中子句;specPath 按「扁平优先,否则 entry.fileName」解析;报错路径维持单行 `spec not found` [blocked-by: T1]
- [x] T3: 门禁全绿 + 下游实测——`just qa`、`llman-sdd validate --all --strict --no-interactive`;xylitol 实测 `show agent-hooks` 出全文与 `--output json`,crystalith 实测 `show architecture-core` [blocked-by: T2]
