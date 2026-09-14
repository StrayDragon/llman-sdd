# Design

## 校验引擎(v1 `spec/validation.rs` 的结构门部分,域逻辑收在 core)

- `packages/core/src/validation/validate.ts`:`validateCapability(doc)` → `ValidationItem[]` 与 `validateAllSpecs(entries)` → `ValidationReport`
- `ValidationItem { level: 'ERROR'|'WARNING', itemType: 'spec'|'scenario'|'header'|'tag'|'registry', id, message }`;报告输出沿用 v1 口径的条目行(`OK spec/<capability>` / `FAIL spec/<capability>` + `FAIL <itemType>/<id>` 明细 + `Totals: N passed, M failed`)
- 规则域(r12):头注释缺失、tag 分层互斥、@manual 孤儿、MUST 词缺失、Rule 内嵌场景、@req 链接指向不存在的全局 id、重复 req id——全部来自 Phase 2 的 parseCapability errors + registry duplicates,本层做聚合与条目化
- 扫描入口 `discoverSpecs(root)`:列 `llmanspec/specs/**/*.feature`(fs 走注入的 port,core 其余保持纯)

## CLI 接入

`apps/cli` 增 `validate` 子命令:`--specs`(默认)、`--no-check`/`--check`(默认跑 `bdd.run_command`,batch-once)、`--strict`;退出码:有 FAIL 即非零。config 从 `llmanspec/config.yaml` 读取(loadConfig)。

## golden 对照(v1 ↔ v2)

`tests/golden/validate-fixture/`:种子缺陷仓库(缺头注释/互斥 tag/重复 req id 各一处);`tests/golden/check-validate.ts` 分别跑 v1(`llman sdd validate --specs --no-check --strict --json` 不可用时用文本)与 v2(`apps/cli validate --specs --no-check`),**归一化后对比**(仅取 `OK spec/*` / `FAIL spec/*` / `FAIL <type>/<id>` 条目行集合,忽略 INFO/耗时/分支提示行);不一致退出非零。

## 测试策略

单元(validate 条目化/聚合)+ BDD(`@executable`:种子缺陷 → FAIL 行断言)+ golden 归一化对照。
