---
depends_on: []
branch: sdd/dedup-human-executable-rules
base_branch: main
base_sha: abf120770a35599a90e76ee88fc0b34998bc4ae6
---

## Why

仓库 13 个 capability 的 87 条 `@human` 规则中，85 条是确定性 CLI/引擎行为（可 GWT 判定），仅 2 条（eval-playbook r84/r85）是纯治理/外部事实。但现行验证引擎强制「规则只能是 `@human` 场景、每 capability 至少 1 条 `@human`、`@executable` 验收必须挂回 `@human` 规则」，导致可自动化行为长期挂着 `@human` 标签，与 llman-sdd-verify 技能分流条款（「凡 GWT 可表达的自动化判定行为 MUST 落 `@executable` 验收；`@human` 仅用于不可自动化的人工约束」）语义相悖。

用户已决策（2026-09-27,路线定策于当日,详见 design.md §1）：**路线 H**——改造验证引擎，使规则可声明为 `@executable`；**合并为一个 change**；缺口 G1（change-lifecycle r35 符号链接）**补实现+验收**；本次**不运行** specs-compact；意外问题**全部当场修**。阶段 0 的逐规则分流与基线不复保留为独立文档（过程性结论不落独立文档，见根 AGENTS.md）；triage 依据以本 proposal Why 段与 design.md 各节为准。

## What Changes

- **引擎：`@rule` 规则标记（与 `@executable` 互斥）**（`packages/core/src/spec/parser.ts` / `ir.ts` / `validation/validate.ts` / `review`）：
  - 规则 = `@req:<id> @rule`（可自动化锚点，MUST 挂 `@executable` 验收）或 `@req:<id> @rule @human`（治理/人工约束，statement 须含 MUST/SHALL）。
  - `@human` 隐式即规则（旧文档向后兼容）；`@executable @req` 场景为验收/可执行行为；`@rule` 与 `@executable` 同场景互斥（判 ERROR）。
  - 每 capability 必须至少 1 条规则（`@human` 或 `@rule`）。
  - 验收的 `@req:<id>` 允许挂回 `@rule` 规则（原仅限 `@human`）。
  - `@rule` 可自动化规则（非 `@human`）必须 ≥1 条链接验收或自带步骤，否则判 ERROR（推动转写 executable、遵循「减少 rule」）。
  - 撰写引导（模板）**优先 executable、尽可能减少 @rule 定义**，并附「何时用 executable / 何时用 rule」示例。
- **specs 转换（13 个 capability 全部）**：85 条可自动化规则由 `@req:<id> @human` 转为 `@req:<id> @rule`（既有配对 `@executable` 验收原样保留，行为守护不变；`@rule` 与 `@executable` 互斥）；2 条治理规则（eval-playbook r84/r85）转为 `@req:<id> @rule @human`。
- **缺口 G1 修复**：change-lifecycle r35 声称「跳过符号链接与点目录」，但实现 `statSync().isDirectory()` 跟随符号链接；改为不跟随符号链接（lstat 语义）并补单测与 BDD 验收。
- **A+ 覆盖不足补验收（15 条）**：为 change-lifecycle r14/r44/r68/r69、peripheral-commands r30/r61、context-index r26/r27/r57、review-freeze r23/r24/r25、eval-playbook r82/r83/r86 补齐此前仅在规则语句声明、无验收守护的判定点（均已有实现，只补验收 + BDD 步骤）。
- **模板同步（阶段 2 强制）**：zh-Hans/en 双语种的 `llman-sdd-propose/apply/verify` 技能文本、`validation-hints`、`feature-contract` 单元按新 `@rule` 模型修订；`init --update` 刷新 `.agents/skills`；重生成 golden 基线并提交。
- **immutable**:不改 `@human` 与 `@executable` 互斥语义、不引入 `@manual`、不新建 `changes/<id>/specs/`；`add-req`/`add-scenario` authoring 面不变（add-req 仍产 `@req:<id> @human` 规则，作者可按需改 `@rule`/`@rule @human`）。

## Impact

- **行为合约文本**：全部 13 个 `.feature` 规则标签变更（`@human` → `@rule` / `@rule @human`，85+2）+ 15 条规则新增验收场景 + r35 语义修订。
- **SDD 引擎自身**：parser/validate/review/runner 语义扩展（向后兼容：`@human` 仍为规则）；`list --specs` morphology 的 ruleCount 口径不变（规则数不变）。
- **测试**：引擎单测扩展；BDD 步骤新增（约 17 条验收的锚定步骤）。
- **模板/golden**：技能文本与基线更新，`bun run generate:skills-template-baseline` + `check:skills-template-render` 必须过（漂移=失败）。
- **文档**：`llmanspec/AGENTS.md` 工程规则不改；本 change 未新建独立规划文档（阶段 0 的一切依据以本 proposal/design 为准）。
- 无破坏性移除字段/命令/tag（`@rule` 为新增，`@human`/`@executable`/`@req` 语义不变），无需迁移文档。
