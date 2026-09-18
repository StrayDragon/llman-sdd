---
depends_on: []
---

# 恢复独立 change archive 命令(含任务完成率门禁与 config 消费)

## Why

双二进制对拍实证:v1 `change archive <id>` 是独立收口命令(与 finalize 并存):任务完成率门禁 + clean-tree 门 + `--dry-run` + hidden `--force`,且消费 config `archive.min_completion_ratio` 与 `archive.strict_defer`;v2 完全缺失(只剩 finalize,且 finalize 无任何任务门禁与校验)。用户已决策:恢复独立命令,finalize 保持轻量。v1 语义已核实:未勾任务默认 Warning、`strict_defer: true` 升 Error、min_completion_ratio 为最低完成率门(spec/validation.rs check_tasks_completion)。

## What Changes

- 新增 `change archive <id>`:git 门(绑定存在、在绑定分支、非默认分支、clean tree)+ 合并语义与 finalize 一致(--into/--method,含 config sdd.merge_method 兜底)+ 改名归档 + 单条 archive(sdd) 提交。
- 任务门禁:tasks.md 有未勾任务时报错并列出未勾项;`archive.strict_defer: true` 时未勾任务判 Error(默认 Warning 不拦);`archive.min_completion_ratio` 低于门禁报错;hidden `--force` 跳过全部任务/git 门禁。
- `--dry-run`:仅输出改名计划,零副作用。
- 补 core 门禁函数单测、CLI 面、BDD 场景。

## Capabilities

- `change-lifecycle`(独立收口与任务门禁合同,新增 @req:r39、@req:r40 规则)

## Impact

- `apps/cli/src/main.ts`(命令注册)+ `packages/core/src/change/`(archive 收口复用 finalize 的合并实现,抽取共用);config 字段已在 schema,零 schema 变更。
- `finalize` 行为不变(轻量口径保持);两命令并存,使用建议(freeze 前收口优先 finalize)不变。
