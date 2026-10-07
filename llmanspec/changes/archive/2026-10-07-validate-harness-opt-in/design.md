# design: validate 全量 harness opt-in

## 背景与问题

`validate` 缺省执行 `specs.check_command`（本仓 `bun test tests/bdd`，20.5s/次）。agent apply 循环按纪律反复 validate，每轮白付全量成本；`--no-check` 因「门禁证据必须真实」纪律被视为"放弃证据"，二者无缓冲。

## 决策（用户 2026-10-07 拍板，取代先前探索中的 harness 跨调用缓存方案）

**不引入缓存**。理由：缓存以「输入 hash 未变」跳过真跑，而 BDD 步骤实现（`tests/bdd/steps/*.ts`）改动不经过 spec hash——存在"缓存假绿"失败模式，恰好违背"门禁证据必须来自真实 harness"的纪律；且本仓 sample 量级（20s）不值得引入持久化状态与失效判定的复杂度。

**采用成本分隔 + 收口兜底**：

1. `validate`：缺省只做结构/状态门（<100ms）；全量 harness 改为 `--check` 显式 opt-in；`--no-check` 保留，语义为显式声明"放弃 harness 证据"（与缺省同效，供报告引用——不删除旗标，避免移除面）。
2. 平时验证：最小单元 → 定向 BDD（`bun test tests/unit/<file>`、`bun test tests/bdd -t "<模式>"`）→ 显式 `validate --check`，逐级扩大。此纪律写入 AGENTS.md 工程规则与 apply/verify skill 模板。
3. `change finalize`/`change archive`：**保持原样**，预合并验收强制真实 harness——硬约束每次收口至少 1 次全量 + 证据真实，验收底线不因应用期节省而松动。

## 边界

- 不动 core `runHarnessForSpecs` 的 `default` 分支语义（配置时执行仍是 core 契约底线）；翻转仅在 CLI 边界 `makeHarnessGate`——CLI 不再下发 `default`（只发 `on`/`off`）。
- `LLMAN_SDD_HARNESS_ACTIVE` 嵌套守卫、unconfigured `--check` 的 `--check has no effect` INFO、review/show 不执行 harness、CI 直跑 `bun test tests/` 均不变。
- 不新增配置项、不删除旗标、无迁移路径；`--all-roots` 聚合语义不变（缺省不再每根跑 harness，`--check` 时仍逐根执行，与 `--specs`/`--changes` 域限定正交）。
