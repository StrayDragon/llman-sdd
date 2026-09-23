---
depends_on: []
needs_specs_change: true
---

# BDD executable 化·MEDIUM 批:peripheral + authoring + parsing + config 配对验收

## Why

阶段性 QA 调研(2026-09-23):19 条 pending 规则全部 GWT 可自动化。本批清 MEDIUM 层 6 条(parser/writer 合约,多数已有邻近单测,主要是 BDD 接线),pending 13→7(与 HIGH 批先后 finalize 时序相关)。

## What Changes(工作说明)

Specs landing 四个文件:`peripheral-commands.feature`、`spec-authoring.feature`、`spec-parsing.feature`、`config-schema.feature`。**不得触碰 validation/change-lifecycle/init-generators/monorepo-structure/review-freeze 的 specs**(并行不相交约束)。

1. **r21 @executable**(peripheral):`show <change> --output json` 断言字段集 id/path/title/stage/artifacts/readyToImplement/specsLanded/needsSpecsChange/attached/deltaCount/gateChecks/matchedViaPrefix 全在;`show <spec>` 直出头注释与 gherkin 原文;`graph --format mermaid` 以 `flowchart TD` 开头、`-`→`_`、archived 标注 `✓ done`、classDef archived 收尾。seam:CLI 子进程。
2. **r22 @executable**(peripheral):`spec skeleton <cap>` 产物过单轨校验;`spec next-req-id` 输出下一空闲 id;`project migrate` 三态——裸调用输出总览、`--kind toon2features|specs-flatten` 各输出协作说明、未知 `--kind` 退出码非零(2026-09-23 已落地的说明出口,场景写准三态)。
3. **r42 @executable**(spec-authoring):`spec add-scenario` 目标 req 存在时追加 `@req:<id> @executable` 验收场景(given 缺省空);req 不存在报错且零副作用。
4. **r7 @executable**(spec-parsing):`# language:` 缺失时 en 匹配器起步失败回退 zh-CN 再试;locale zh-Hans 映射 gherkin zh-CN,其余透传。seam:core 纯函数或 fixture。
5. **r8 @executable**(spec-parsing):三头注释缺失项逐一报告(capability/purpose/scope)。
6. **r5 @executable**(config-schema):顶层字段域 schema/locale/extra_skills/archive/bdd/sdd/change_id;未知字段宽松放行;schema 非法值报错。

## Capabilities

- peripheral-commands(r21/r22)
- spec-authoring(r42)
- spec-parsing(r7/r8)
- config-schema(r5)

## Impact

- pending →7(视与 HIGH 批 finalize 顺序)
- 无行为变更(纯验收补齐);步骤复用 tests/bdd/steps/domain.ts 既有 rN 分节模式,预期新 fixture 极少
- 并行约束:仅动上述四 spec 与对应 steps;不得并行触碰 validation/change-lifecycle 的 specs
