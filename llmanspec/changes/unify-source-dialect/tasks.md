# Tasks

测试边界(seam):单测 seam 为 `sourceDialect` 纯函数与既有 authoring/migrate 纯函数;回归以全量既有单测/BDD 零漂移为等价性证据,不引入新 seam。

- [ ] t1: parser.ts 新增导出 `sourceDialect(source)`(头注释优先 → 兜底链自动发现 → en),migrateNative 与 authoring 删除各自本地判定并改用共享函数;tests/unit/spec.test.ts 补判定顺序单测
- [ ] t2: specs 措辞同步:r41 括注移除 `功能:` 探测、改为统一口径;r88 括注补「不可判兜底英文」;全量 `just qa` 与 `bun test tests/bdd` 零漂移
