---
depends_on:
- port-context-index
blocks:
- release-v2-and-cutover
branch: sdd/refine-slop-qa-release
base_sha: 458260ad0d82b6e6464b0e2ebf25a4ca0f489daf
base_branch: main
---

# Refine:全链路 slop 重构、QA 链路适配与工程化收尾(插队,先于 release)

## Why

v1 全功能面已在 v2 对等(8 个 port-* change 归档,四道 golden 全绿),但迁移过程累积了一批已知债务,且真实 LLM 链路验证(context 对接 ../llman 27 specs 实测)暴露了若干仅在线上才可见的适配点。发版(`release-v2-and-cutover`)之前需要一次集中的重构、清理与 QA 链路收口,避免把 slop 带进 v1.0.0。

已实测确认的适配点(真实 LLM 链路,../llman 27 specs,worktree 隔离验证):
- quality 成功态为 `agentic` + `summary` 汇总对象(已在 cd44f71 修复)
- v1 的进度行走 stderr、结果行走 stdout——capture 契约需在文档与 CLI 行为中固化
- 真实 specs(../llman)在 v2 解析器下全量通过,但 LLM 分类存在 direct/related 重复条目(如同一 spec 同时出现在两档)——需要去重裁决
- 错误路径契约偏差:v1 循环耗尽降级为 `agentic`+截断注记、检索失败输出 `unavailable`+`summary:{totalSpecs:0,error:true}`,v2 现为 `quality:'error'`+全形状 summary——需对齐

## What Changes

- **context 输出契约裁决落地(specs r28/r29)**:direct∩related 去重(direct 胜出、档内首见保留)、summary 成功/错误双形状、quality 值域收窄为 `agentic|unavailable`、循环耗尽降级语义、stdout=结果/stderr=进度 capture 契约,全部固化进 context-index spec 并实现对齐
- **QA 链路工程化**:golden 四门统一入口与 CI 化(golden:check 免 v1 可进 CI;golden:cli 与 check-validate 需 PATH v1,评估 `cargo install llman@0.0.78` 成本后默认不进 CI);真实 LLM 链路验收脚本化(`scripts/smoke-context.ts`,env 守卫、缺省跳过)
- **全链路 slop 重构与清理**:CLI 三套 io 适配器(makeFsIo/FS_IO/makeIndexIo)收敛为单一模块;golden 脚本重复逻辑下沉 lib;移除 `collectReviewEntries` 死代码;逐文件 TODO/FIXME 审计(模板脚手架内 TODO 为有意内容,记录裁决)
- **验收设计落地**:`docs/acceptance-v2.md` 发布前验收清单(v1↔v2 全命令对照矩阵、真实项目试点步骤、性能基线);`scripts/perf-baseline.ts` 性能基线脚本并记录实测数字
- 明确不做:发版动作本身(归 `release-v2-and-cutover`);Agent pid 环境噪声差异不移植(记录裁决于 design)

## Impact

- 行为修正仅限 context 命令输出契约(context-index spec 新增 r28/r29),无其他用户可见功能变化
- 完成后 `release-v2-and-cutover` 的验收成本显著降低;该 change 的 What Changes 将引用 `docs/acceptance-v2.md`
