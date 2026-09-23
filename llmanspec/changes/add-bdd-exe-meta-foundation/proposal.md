---
depends_on: []
needs_specs_change: true
---

# BDD executable 化·LOWER 批:init + monorepo + review-freeze 元基座配对验收

## Why

阶段性 QA 调研(2026-09-23)19 条 pending 的收尾批:元基座与结构合约。多数已被 qa/golden/CI 间接锁定,executable 化价值=合约锁定(防静默删除)。pending → 0。

## What Changes(工作说明)

Specs landing 三个文件:`init-generators.feature`、`monorepo-structure.feature`、`review-freeze.feature`。**不得触碰其他 spec 文件**(并行不相交约束)。

1. **r17/r18 @executable**(init):渲染语义(Lenient 空渲染/unit 递归 32 上限/缺失报错/尾随空白/单换行落盘)与 locale 归一化回退链——templates.test.ts 已有断言,BDD 接线并挂回规则。seam:core 纯函数(steps 可直调 renderTemplate/localeFallbacks)。
2. **monorepo r1-r4 @executable**(可合并为 1-2 个场景):工作区布局(package.json workspaces 含 core+cli)、justfile check/qa 聚合门存在、core 纯域(oxlint ignorePatterns)、BDD runner 就绪。seam:文件系统断言(仿 r67 模板对账门的 smoke 步骤形态)。若实施中判定与 qa 重复而保留 @human,r66 判据要求在 proposal 记录理由。
3. **r24 @executable**(review-freeze):freeze 写 `freezed_changes.7z.archived` 并删原目录、`--before`/`--keep-recent` 候选语义、thaw 恢复。**前置**:7z 存在性守卫(缺 7z 干净跳过,仿 smoke-context env 守卫模式),archive.test.ts/domain.ts 既有步骤可复用。

## Capabilities

- init-generators(r17/r18)
- monorepo-structure(r1-r4)
- review-freeze(r24)

## Impact

- pending →0,`just pending-gate` 基线随 finalize 下调至 0,计量门自此全面生效
- 无行为变更;monorepo r1-r4 若走「有据保留 @human」路线,需在本 proposal 记录不可执行/不自动化理由
- 并行约束:仅动上述三 spec;不得并行触碰 validation/change-lifecycle/peripheral/spec-authoring/spec-parsing/config-schema 的 specs
