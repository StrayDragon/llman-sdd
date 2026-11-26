# Tasks: add-studio-domain-core

> 验收 Seam：`packages/core` 公开导出的 `studio/*` 纯域函数（经 `tests/unit/studio/` 由 `bun test` 驱动，I/O 一律经内存态 `StudioStateIo` 夹具注入，零真实磁盘污染）。

- [x] T1 实现状态机图 IR 与 `.feature` 提取：在 `packages/core/src/studio/model.ts` 与 `extract.ts` 实现 `StudioMachineIR` / `MachineDraft` / `StudioStateDoc` 类型、稳定 `uid` 分配与从 `SpecEntry[]` 提取纳管状态机（复用并导出 `xstateTransitions.ts` 辅助函数，同时支持 `mode: 'modify'` 与 `mode: 'create'`），在 `tests/unit/studio/extract.test.ts` 覆盖中英文列、守卫、`@transitions`/`@no-transitions` 与 0→1 新建场景。

- [x] T2 `[blocked-by: T1]` 实现可扩展 Linter 全量图校验：在 `packages/core/src/studio/validate.ts` 基于 `@statelyai/graph` 实现 `validateMachineGraph(machine)`，一次返回含 `code`、`severity: 'error' | 'warning'`、精确 `stateUid`/`edgeUid` 定位与可选 `fixable` 标记的诊断列表（覆盖阻断错 E1–E4 及非阻断警告 W1–W2，不改动既有 CLI `validateTransitionScenario` 行为），在 `tests/unit/studio/validate.test.ts` 覆盖孤岛、死锁、陷阱、自环、重复确定性冲突、警告规则及无回归校验。

- [x] T3 `[blocked-by: T1]` 实现语义 Diff 引擎与极简摘要渲染：在 `packages/core/src/studio/diff.ts` 实现 `computeMachineDiff`（忽略 `layouts` 坐标、按 `uid` 精准识别状态改名不炸假边、细粒度标注转移变化字段）与 `formatSemanticDiff`（输出极简 `+ / - / ~` 文本块），在 `tests/unit/studio/diff.test.ts` 补齐单测。

- [x] T4 `[blocked-by: T3]` 实现图元锚定评论与 Agent 修订建议层：在 `packages/core/src/studio/revisions.ts` 实现 `StudioComment` 读写与解决流转、`StudioRevisionProposal`（含显式 `rename_state` 与转移增删改 op）、`previewRevisionProposal` 预演与 `acceptRevisionProposal` 原子采纳（确保建议层不直接覆盖人类草稿），在 `tests/unit/studio/revisions.test.ts` 补齐单测。

- [x] T5 `[blocked-by: T1, T4]` 实现本地草稿存储契约、Git 式变更时间线与内置样例：在 `packages/core/src/studio/store.ts` 定义 `.llman-sdd/studio/states/<id>.json` 的 `zod` 校验、线性快照时间线（`BASE` 实际真理 → `HEAD` 用户草稿、时间旅行只读切片、回滚与净 Diff 聚合）、路径安全校验与注入式原子写盘端口 `StudioStateIo`（临时文件 + `rename`），在 `demos.ts` 内置报销审批与任务重试 2 套演示状态机（全部通过 `validateMachineGraph`），在 `tests/unit/studio/store.test.ts` 补齐单测。

- [x] T6 `[blocked-by: T2, T3, T4, T5]` 实现绑定分支 `.feature` 无损渲染、草案组装与内存 Unified Diff 预览：在 `packages/core/package.json` 引入 `diff >= 8.0.3`（免疫 CVE-2026-24001），在 `packages/core/src/studio/featureSync.ts` 实现 `buildProposalDraft`、`renderUpdatedFeatureSource`（覆盖 `modify` 保留注释缩进、`create` 新建/追加与目标缺失报错）与 `previewFeatureUnifiedDiff`，在 `packages/core/src/index.ts` 汇总导出，并在 `tests/unit/studio/featureSync.test.ts` 验证写回后的 `.feature` 经 `parseCapability` + `validateCapability` 全绿，最后运行 `just qa` 确认全仓门禁通过。
