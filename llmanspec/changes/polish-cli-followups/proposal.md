---
depends_on: []
needs_specs_change: false
---

# CLI 体验收尾杂项(draft 防遗忘)

## Why

TOON 缺省化程序(toon-default-output,已归档)收官时登记的三项低优先级收尾,单独立此 draft 防遗忘;各项均小,可合并一个 change 或按需拆分。当前仅记录意图,排期后补 design/tasks 再实施。

## What Changes

- **authoring helpers 目录式支持**:`spec add-req`/`add-scenario`(`packages/core/src/spec/authoring.ts`)仍按扁平 `specs/<cap>.feature` 拼写路径;目录式仓库(如 ../xylitol、../crystalith)写入会落空。需先定写入布局约定(目标 spec 已是目录式 → 写入 `<cap>/<cap>.feature`;不存在时按 `spec skeleton` 的产物布局),再让 add-* 复用 discoverSpecs entries 解析
- **context toon 化**:`context` 现恒 pretty JSON(context-index 合约钉 stdout JSON);作为纯 agent 命令改 TOON 缺省或加 `--output` 面收益为零,视合约改写成本决定做或不做——做则走完整 SDD(context-index.feature 条款重写)
- **--type 帮助文案统一**:validate 写 "force disambiguation: change | spec"、show 写 "item type hint: change|spec",同一概念两套措辞;统一为一句(顺带 review 该 flag 在两命令的语义差异是否要在 help 里说清)

## Capabilities

- peripheral-commands(authoring helpers、--type 文案)
- context-index(仅 context toon 化项,或明确不做)

## Impact

- 三项互相独立,均可 quick 或小 change;不触碰缺省输出面(0.4.0 已定案);无迁移需求
