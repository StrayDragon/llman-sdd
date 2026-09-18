---
depends_on: []
branch: sdd/align-next-id-numeric
base_branch: main
base_sha: 1f7a1edd74efb6de4ff7a08a5222c79618df965a
---

# change next-id 回归 v1 数字编号计数语义

## Why

双二进制对拍实证语义完全分叉:v1 `change next-id` 是无参数数字编号计数器(扫描全树输出 max/next free number,`--json` 输出 {maxNumber, nextNumber, warnings}),v2 改成了 `next-id --from <描述>` 派生预览。v1 的 change_id.template 工作流(数字编号型 id)与既有脚本/文档依赖该语义;派生预览职责在 v1 由 `change new --dry-run` 承担。用户已决策:恢复 v1 数字计数(对齐差距清单-语义分歧,方向=恢复 v1)。

## What Changes

- `change next-id` 回归无参数数字计数:扫描全树(含 changes/archive/ 归档目录)的数字编号 change 目录,人读输出 max number 与 next free number 两行;`--json` 输出 {maxNumber, nextNumber, warnings};无编号目录时 maxNumber=null、nextNumber=1;命令保持只读。
- `change new` 补 `--dry-run`:仅输出将派生的 change id(承接原 next-id --from 的预览职责),不创建文件;`<id>`/`--from` 互斥规则不变。
- 移除 `next-id --from` 必填选项(破坏性 CLI 面变更,随本 change 在 specs 声明,无迁移脚本需求——原语义生命周期仅 v2 0.1.x 短暂存在)。
- 数字扫描 util 供 change_id.template 的 llman_sdd_unique_id 变量复用(为 change-id-template change 打底)。

## Capabilities

- `change-lifecycle`(next-id 数字计数 + change new --dry-run 合同,新增 @req:r35、@req:r36 规则)

## Impact

- `apps/cli/src/main.ts`(next-id/new 命令面)+ `packages/core/src/change/`(扫描 util);id 派生逻辑(id.ts)保留给 change new。
- 依赖 `next-id --from` 的调用方需改用 `change new --dry-run`。
