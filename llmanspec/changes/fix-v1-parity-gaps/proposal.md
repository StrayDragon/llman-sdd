---
depends_on: []
---

## Why

三类 v1→v2 对齐缺口与 verify 遗留技术债，一并收敛：

1. **change id 前缀解析缺失（用户报告）**：v1 (r112) 的 `show`/`validate` 支持
   `c2805 -> c2805-update-todo-llm-api (prefix match)` 的前缀解析；v2 只做精确 id 匹配，
   报 `change not found: c2805`。v2 的 JSON 里 `matchedViaPrefix` 字段存在但恒为
   `false`（show.ts/main.ts 硬编码），属口径悬空。消费仓 change id 形如
   `c2805-update-todo-llm-api`，前缀引用是 agent/脚本高频用法，属「CLI flag 面」对齐范围。
2. **review-freeze r23 措辞与实现不符（verify SUGGESTION ①）**：条款写
   「warningCount MUST 等于 pending 总数」，但 v1 review.rs 实为 pending + unbound +
   stale 三类信号求和（review.rs L129/137/156），v2 实现与 v1 一致——是条款措辞错，
   不是实现错。
3. **morphology 重复实现（verify SUGGESTION ②）**：`apps/cli` renderSpecJson 内联
   morphology 字面量与 `packages/core` specs.ts `morphologyOf` 重复，上次 remove-manual-tag
   已删除两者中互相矛盾的 manual 口径，本次把字面量收敛为复用 core 单一来源。

## What Changes

- 核心新增 change id 前缀解析器（v1 r112 语义：exact > unique prefix > multiple 报错
  列候选 > not found；大小写敏感；候选 = 活跃 changes）：`show` 与 `validate <item>` 的
  change 分支接入；唯一前缀命中时人读输出向 stderr 打
  `'input' -> 'resolved' (prefix match)` 提示；JSON `matchedViaPrefix` 如实上报。
- 行为合约（Specs landing）：peripheral-commands 新增 r61（show/validate change id
  前缀解析合同）并在 r21 字段集补 `matchedViaPrefix`；review-freeze r23 的
  warningCount 措辞改为「pending、unbound、stale 三类信号计数之和」。
- 重构：`renderSpecJson` 的 morphology 字面量改为复用 `collectSpecs` 的
  `SpecMorphology`（纯实现层，无输出变化）。

## Capabilities

- peripheral-commands（show/validate 的 change id 解析面）
- review-freeze（r23 warningCount 措辞）

## Impact

- 无 breaking：精确 id 行为不变，前缀解析是纯增量能力；`matchedViaPrefix` 字段从恒
  false 变为如实上报，依赖该字段的下游在此前不可能见过 true，无实际兼容风险。
- v1 的归档 change 兜底解析（active 未命中时匹配 archive/）与 levenshtein
  did-you-mean 本次不移植，后续有真实需求再议。
