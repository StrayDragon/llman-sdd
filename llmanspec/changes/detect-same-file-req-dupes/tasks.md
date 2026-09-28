# Tasks

测试边界（seam）：单测 seam 为 `buildReqRegistry` / `planDedupe` 纯函数（tests/unit 既有套件）；BDD seam 为 tests/bdd 既有 CLI 子进程/临时仓库步骤（specs 新增场景驱动）。不引入新 seam。

- [ ] t1: `reqRegistry.ts` occurrence 化:`byId` 值改 `RegistryOccurrence[]`(文件+规则序号+标题),判重按出现数 > 1(同/跨文件均算),`RegistryDuplicate` 增 `occurrences` 保留 `files`;tests/unit 补同文件/跨文件/混合三态单测(钉板 issue #4 最小用例)
- [ ] t2: `project.ts` dedupe-req-ids 删本地扫描复用 `buildReqRegistry`;`authoring.ts` planDedupe 出现全序(首现保留)生成计划、`DedupePlanItem` 增 `occurrenceOrdinal`;tests/unit 补同文件 remap 计划单测
- [ ] t3: planDedupe apply 改 tag 词边界 + 出现次序定点替换(修 `@req:r1` 误伤 `@req:r10`);tests/unit 补前缀共存回归用例(r1 与 r10 同文件)
- [ ] t4: 全量 `just qa`(含 BDD 新场景:validate 同文件碰撞 ERROR、dedupe 同文件 remap)绿;既有跨文件行为零漂移
