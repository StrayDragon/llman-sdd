---
depends_on: []
branch: sdd/detect-same-file-req-dupes
base_branch: main
base_sha: 08f274d1ffaf68fa293ff54dbc8c8310d16a7ce8
---

# 同文件 @req 碰撞检出与重映射

## Why

`@req:rN` 是 0.5 句柄系统的全局唯一键（`spec resolve-req` 反查、review/锁定报告、归档 change 引用都依赖它）。但 0.5.0 的两道防撞门在**同一个 `.feature` 文件内**多条规则挂同一 reqId 时全部漏报：`validate --specs --strict` 判 valid、`project dedupe-req-ids --dry-run` 报无碰撞。根因是两处同型实现都按 fileName 去重后判 `files.length > 1`（`reqRegistry.ts` 的 `buildReqRegistry` 与 `project.ts` 的本地扫描），同文件碰撞时 `files.length === 1` 被过滤。下游 crystalith 实际命中 45 个碰撞 tag / 54 处，两道门均静默；`resolveReq` 走首个匹配，歧义解析无声。issue #4。

顺带发现同路径潜伏缺陷：`planDedupe` apply 用 `replaceAll('@req:r1', …)` 整串替换，会把 `@req:r10` 误改（前缀子串碰撞）——本 change 一并修复。

## What Changes

- `buildReqRegistry` 判重改按「携带该 reqId 的**规则条数** > 1」（同文件内或跨文件均算）；`RegistryDuplicate` 除 `files` 外新增 `occurrences`（逐出现定位：文件 + 规则序号 + 规则标题）。
- `project dedupe-req-ids` 删除 CLI 本地同型扫描，复用 `buildReqRegistry`；remap 计划覆盖同文件第 2+ 次出现（语义：**首现保留，其余重取号**，与下游 crystalith 手工修复策略一致）。
- `planDedupe` apply 的整串 `replaceAll` 改为出现次序定点替换（tag 词边界匹配），修复 `@req:r1` 误伤 `@req:r10` 的前缀碰撞；`DedupePlanItem` 携带出现次序。
- specs 措辞澄清与场景钉板：r10（注册表判重含同文件）、r12（ERROR 门含同文件）、r43（dedupe remap 覆盖同文件），各补同文件场景。

## Capabilities

- `specs/spec-parsing`：r10 判重语义与报告定位扩展（同文件）。
- `specs/validation`：r12 ERROR 门措辞澄清（同文件碰撞也判 ERROR）。
- `specs/spec-authoring`：r43 remap 计划覆盖同文件第 2+ 出现。

## Impact

- `packages/core/src/spec/reqRegistry.ts`（occurrence 模型）、`spec/authoring.ts`（planDedupe 定点替换）、`apps/cli/src/commands/project.ts`（复用 registry）。
- 公共导出形状变化：`RegistryDuplicate` 新增字段、`byId` 值类型改为出现列表；仓内消费者审计过（`nextReqId` 仅用 keys、`buildDuplicatesFor` 仅用 duplicates、CLI 复用后删除本地扫描），无第三方兼容层。
- 无破坏性命令/字段删除；既有跨文件行为不变（唯一可见差异：同文件碰撞从静默变为报错/remap）。
