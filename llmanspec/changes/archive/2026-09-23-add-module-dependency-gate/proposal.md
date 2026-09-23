---
depends_on: []
branch: sdd/add-module-dependency-gate
base_branch: main
base_sha: 876b8313192996a60c0ba1f94b58b877b1eceb10
---

# 模块依赖方向门禁:冻结 core 模块边集,止住层间腐蚀

## Why

架构审视(2026-09-23)发现 packages/core/src 顶层模块间存在 **4 组真实导入环**,全部由小东西驱动(常量/纯类型/纯推导函数住错了家):

1. `change/resolve.ts → report/collect.ts` 而 `report/{collect,show}.ts → change/{frontmatter,lifecycle,tasks}.ts`(report 只为 `CHANGES_DIR` 常量借道 456 行的 lifecycle.ts);
2. `report/{specs,show}.ts → validation/{validate,discover}.ts` 而 `validation/changeCheck.ts → report/collect.ts`(借 `stageFor`);
3. `config/changeId.ts → change/nextId.ts` → `report/collect.ts` → `report/specHelpers.ts → templates/locale.ts` → `templates/skills.ts → config/schema.ts`(借 `SddConfig` 类型);
4. `validation/changeCheck.ts → change/frontmatter.ts`。

环的代价:没有任何导入方向是"错的"——后续 AI 改动会 import 离手最近的模块,层间知识双向耦合,重复实现悄然滋生。**本 change 只止损不动结构**:把当前边集冻结为声明的允许表,新边必须显式改声明;断环本身(抽叶子词汇层)是后续独立 change。

## What Changes

- 新增门禁 `tests/unit/module-dependency-parity.test.ts`:扫描 `packages/core/src/**` 的相对导入,解析为「顶层模块 → 顶层模块」边集(文件级解析;barrel `src/index.ts` 豁免;类型导入与值导入同权;同模块内部导入不计),与声明允许表比对,违例逐条报出来源文件与违例边。
- 声明允许表 = 当前实测边集(零收紧、零放宽;`git`/`spec`/`render` 为叶子):
  change→[git,report];config→[change];context→[spec,validation];init→[config,templates];report→[change,git,render,spec,templates,validation];review→[git,spec,validation];templates→[config];validation→[change,git,report,spec]。
- monorepo-structure 新增规则 **r72**(经 `spec next-req-id` 分配):跨模块导入 MUST 落在声明允许表内,新增边 MUST 先改声明;对账以自动门禁随 bun test 套件运行。配 @executable 验收。
- 出界:apps/cli 的命令→cli-shared 单向规则(目前以 cli-shared.ts 头注释承载)不入本门禁;断环重构不在本 change。

## Capabilities

- monorepo-structure:新增 r72(@human + @executable 配对);新门禁测试落 `tests/`(该 spec 的 valid_scope 内,spec 随之更新免 staleness)。

## Impact

- 文件:+1 测试门禁;monorepo-structure.feature +1 规则 +1 验收场景。
- 无行为面变化(纯测试侧);golden 不涉及(不触模板)。
- seam(复用既有):r67/r70 同型「源扫描 + 声明表」门禁 seam;BDD `执行命令` 步骤驱动验收。
