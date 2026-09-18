---
depends_on:
  - align-next-id-numeric
---

# change 族 flag 对齐:new/attach/start/finalize/diff

## Why

对拍差距清单(flag 组)中 change 族的缺口:旧版 `change new --force/--dry-run/--verb`、`change attach --force/--base`、`change diff --json/--export-patch` 在 v2 报 unknown option;`start` 不消费 config `sdd.branch_prefix`(只认 CLI flag);`finalize` 不消费 config `sdd.merge_method`、缺 `--no-check/--no-commit`,且 v1 finalize 合并前有校验 sweep 门,v2 完全没有。方向已定:全量对齐。

## What Changes

- `change new --force`(覆盖已存在 proposal)、`--verb <V>`(--from 派生时显式指定动词,供 change_id.template 与自动识别兜底)。
- `change attach --force`(已绑定时重绑当前分支)、`--base <branch>`(显式记录 fork 源,须存在且非当前分支)。
- `change start` 分支前缀取值序:CLI `--branch-prefix` > config `sdd.branch_prefix` > `sdd/`。
- `change finalize`:合并前 MUST 执行一次 specs+change 校验 sweep(失败中止,不合并不改名),`--no-check` 跳过;`--no-commit` 完成改名但跳过自动提交并输出手工收尾指引;合并方式取值序 `--method` > config `sdd.merge_method` > squash。
- `change diff --json`({change, branch, base, commitCount})与 `--export-patch <path>`(diff 写文件)。
- r44-r46 三条新规则固化;单测 + BDD 场景齐备。

## Capabilities

- `change-lifecycle`(@req:r44-r46)

## Impact

- core lifecycle/finalize 校验 sweep 为新增行为(对齐 v1);`show` 的 gateChecks.validate 提示文案将在该校验真实存在后成立。
- 依赖 align-next-id-numeric(--verb 派生链路)。
