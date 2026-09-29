---
depends_on: []
branch: sdd/align-next-req-id-max-plus-one
base_branch: main
base_sha: 6f9cbdf157540288754abe2763fef9d2755a0671
---

# spec next-req-id 取号语义改为 max+1（对齐 change next-id）

## Why

`spec next-req-id` 当前采用最小空闲号（smallest free）语义：某 capability 被删除、其 req id 释放后，下一次取号会复用刚退役的号。归档 change（archive）中对旧 id 的历史引用因此产生歧义——`spec resolve-req`、`change diff`、锁定规则报告等按 rN 索引的工具无法区分「复用的号」与「退役的号」，历史提案里的 rN 指向被静默偷换（GitHub issue #5；报告者已在消费侧实测复现：删除 r39-r45 号段后 `next-req-id` 返回 r39，而树内实际最大号为 r473）。

同仓 `change next-id` 已是 max+1 语义（全树扫描取最大编号 + 1），两套取号语义不一致是持续的困惑源。本变更将 `spec next-req-id`（含共用实现的 `spec skeleton` 骨架取号）统一为 **max+1**：输出全局 rN 注册表中的最大已用号 + 1，空注册表输出 r1。已退役号段不再被复用，归档历史引用保持无歧义。

## What Changes

- `packages/core/src/report/specHelpers.ts` 的 `nextReqId`：取号算法由 smallest free 改为 max+1（全局 rN 注册表 = 树内 `规则:` 块头 `@req:rN` 句柄集合）；原「前代 parity」注释改写为有意 divergent 的记录（divergence 理由见 design.md）。
- `apps/cli/src/commands/spec.ts`：`next-req-id` 的 help 描述由 "next free" 改为 max+1 措辞（英文文案；输出形状 `{reqId}` JSON / 裸 rN 行不变）。
- specs：`peripheral-commands.feature` r22 规则的 MUST 条款由「输出下一个空闲 id」改写为 max+1 语义（本变更落地）；r22 既有场景与新增空缺回归场景的文本/绑定随实施阶段同步（见 tasks）。
- 测试：`tests/unit/report.test.ts` 单测重写为 max+1 断言（含空缺不复用回归锁）；`tests/bdd/steps/output-contract.ts` 步骤绑定随场景文案更新并新增空缺场景绑定。

## Capabilities

- `specs/peripheral-commands`：r22「spec 助手与 migrate 引导壳」规则的 next-req-id 语义条款改写；实施阶段更新其场景并新增空缺回归场景。r55（`--json` 形状）条款不变。

## Impact

- 受影响命令面：`spec next-req-id`、`spec skeleton`（共用取号实现）。输出形状不变，仅取值语义变化。
- 行为差异仅在树内存在空缺号段时可见：编号连续的仓库输出不变；有退役号的仓库输出从「复用最小空缺」变为「max+1」。无 schema/命令面增删，无迁移路径。
- 明确不在本变更范围（语义维持现状）：
  - `change-lifecycle` 的 `llman_sdd_unique_id`（`change new --from` 模板注入的「全树含归档的最小空闲编号」）——模板注入去撞车机制，与前代 parity 一体，非新条款分配；
  - `spec-authoring` 的 `project dedupe-req-ids`（冲突重映射取空闲短 id）——树内冲突修复语义，不是新条款分配；
  - 不引入 `--mode` 选项、tombstone 烧号集合、低位号告警（方案取舍见 design.md）。
- 模板面：`templates/**` 对 next-req-id 的既有措辞（「全局 rN 分配」）语义中立，不改动；skills golden 基线预期无漂移。
