---
depends_on: []
needs_specs_change: false
---

# CLI 体验收尾杂项(draft 防遗忘)

## Why

TOON 缺省化程序(toon-default-output,已归档)收官时登记的三项低优先级收尾,单独立此 draft 防遗忘;各项均小,可合并一个 change 或按需拆分。当前仅记录意图,排期后补 design/tasks 再实施。

## What Changes

- **authoring helpers 目录式支持**:`spec add-req`/`add-scenario`(`packages/core/src/spec/authoring.ts`)仍按扁平 `specs/<cap>.feature` 拼写路径;目录式仓库(如 ../xylitol、../crystalith)写入会落空。需先定写入布局约定(目标 spec 已是目录式 → 写入 `<cap>/<cap>.feature`;不存在时按 `spec skeleton` 的产物布局),再让 add-* 复用 discoverSpecs entries 解析
  - **合约约束(2026-09-23 勘察)**:`spec-authoring.feature` r-add-req 把「向 `llmanspec/specs/<capability>.feature` 追加」的扁平路径**钉进合约**——本项属行为合约变更,MUST 走完整 SDD(`llman-sdd-propose`,Specs landing 改 spec-authoring),不能 quick
- **context toon 化**:**明确不做(2026-09-23 定案)**。`context-index.feature` 把 stdout 嵌套 JSON 结构钉进 MUST 条款(status/direct/related/summary 全链),改 TOON = 合约重写;而 context 是纯 agent 命令,agent 消费 JSON 无损耗,面收益为零。重启条件:context 未来转为人读排障为主再议
- **--type 帮助文案统一**:✅ 已完成(2026-09-23 quick 清理)——show 侧改为与 validate 一致的 `force disambiguation: change | spec`;两命令语义核实相同(均覆盖自动消歧),差异仅原文案措辞
- **onboard/show 两个孤儿 skill 模板(2026-09-23 复核登记)**:`templates/{zh-Hans,en}/skills/llman-sdd-{onboard,show}.md` 不在 DEFAULT_SKILL_FILES(10,合约钉死)也不在 OPTIONAL_SKILL_FILES,任何 extra_skills 组合都无法选中——属永不可渲染的死模板(show 内容已随 0.4.0 修正)。待决策:补进 OPTIONAL_SKILL_FILES 激活为 extra_skills 可选项,或删除;激活属 init 产物面变化,待拍板后走 quick

## Capabilities

- peripheral-commands(authoring helpers、--type 文案)
- context-index(仅 context toon 化项,或明确不做)

## Impact

- 三项互相独立。剩余仅 authoring helpers 一项,走完整 SDD;--type 已完成,context toon 化已定案不做;不触碰缺省输出面(0.4.0 已定案);无迁移需求
