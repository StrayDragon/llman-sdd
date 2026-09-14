---
depends_on:
  - port-config-and-parsing
---

# Port:校验引擎(Phase 3)

## Why

校验规则集是产品核心(v1 `spec/validation.rs` 约 2,360 行 + `staleness.rs` + `lock_gate.rs` 的 `@human` 锁定规则哈希):Gherkin 结构门、`@req` 链接门、分层互斥、staleness 漂移检测、`validate --all/--stage/--strict/--check` 全套语义。

## What Changes

- 移植全部校验规则与 FAIL 报告格式(`FAIL <item_type>/<id>` 行可定位)
- `validate` 命令接入 CLI;`--check` 走 `bdd.run_command`(bun test tests/bdd)
- golden 验收:同一 fixture 上 v1/v2 的 validate 输出 diff 为空
- `@executable` 场景成为本工具自身 specs 的可执行验收(bun test 通道全通)
