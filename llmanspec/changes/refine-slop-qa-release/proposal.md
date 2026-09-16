---
depends_on:
  - port-context-index
blocks:
  - release-v2-and-cutover
---

# Refine:全链路 slop 重构、QA 链路适配与工程化收尾(插队,先于 release)

## Why

v1 全功能面已在 v2 对等(8 个 port-* change 归档,四道 golden 全绿),但迁移过程累积了一批已知债务,且真实 LLM 链路验证(context 对接 ../llman 27 specs 实测)暴露了若干仅在线上才可见的适配点。发版(`release-v2-and-cutover`)之前需要一次集中的重构、清理与 QA 链路收口,避免把 slop 带进 v1.0.0。

已实测确认的适配点(真实 LLM 链路,../llman 27 specs,worktree 隔离验证):
- quality 成功态为 `agentic` + `summary` 汇总对象(已在 cd44f71 修复)
- v1 的进度行走 stderr、结果行走 stdout——capture 契约需在文档与 CLI 行为中固化
- 真实 specs(../llman)在 v2 解析器下全量通过,但 LLM 分类存在 direct/related 重复条目(如同一 spec 同时出现在两档)——需要去重或按 v1 语义裁决

## What Changes

- **上下文/QA 链路适配**:context 输出去重(direct∩related 裁决)、`Agent pid` 行为差异裁决(环境噪声,不移植,写入文档)、capture 流(stdout/stderr 分工)在 README/AGENTS 固化
- **QA 链路工程化**:golden 四门(skills/validate/cli/冷备兼容)统一入口与 CI 化评估(哪些门可进 CI:validate-golden 需 v1 二进制,评估 `cargo install llman@0.0.78` 的 CI 步骤成本);真实 LLM 链路验收脚本化(`context --task` 冒烟,LLMAN_SDD_INDEX_* 就绪时执行)
- **全链路 slop 重构与清理**:多轮补丁累积的技术债集中清理——重复 io 适配器收敛(CLI 内 makeFsIo/makeIndexIo/FS_IO 三套)、golden 脚本重复逻辑、`review.ts` 的 collectReviewEntries 死代码、`Artifact` 命名与目录约定统一;逐文件过一遍 TODO/FIXME
- **验收设计**:发布前验收清单(v1↔v2 全命令对照矩阵、真实项目试点(拿 ../llman 或 crystalith 跑一次完整 SDD 流程)、性能基线(大 specs 目录下的 validate/context 耗时))
- 明确不做:发版动作本身(归下一个 change)

## Impact

- 不新增用户可见功能;行为修正仅限 context 去重裁决(如有,需在 context-index spec 上补条款)
- 完成后 `release-v2-and-cutover` 的验收成本显著降低;该 change 的 What Changes 将引用本 change 的验收清单
