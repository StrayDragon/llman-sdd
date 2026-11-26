# Tasks: add-studio-drift-trace

> 验收 Seam：① `packages/core` 纯域 Runtime Trace 对账与跨语言 `@llmanspec:` 最小切片单测；② `llman-sdd studio drift` 子进程集成测试（验证零改写 `llmanspec/specs/`、`--fail-on-shadow` 退出码、`--write-state` 原子写入）；③ Studio Web 逻辑漂移校准与反向建议裁决交互 + `llman-sdd-studio-drift` skill golden 基线与全仓 `just qa`。

- [ ] T1 实现纯域 Runtime Trace 对账与跨语言 `@llmanspec:` 切片引擎：在 `packages/core/src/studio/drift.ts` 实现 JSONL Trace 解析（`zod` 校验并精确报坏行号）、`reconcileRuntimeTrace`（0-Token 检出 `shadowTransitions` / `uncoveredTransitions` / `unknownMachines`）、跨语言注释 `@llmanspec:` 锚点扫描（覆盖 TS/Rust/Python 注释风格）与 `buildDriftSlicePacket` 最小切片构建、以及 Shadow 转 `StudioRevisionProposal (source: 'drift-trace')`，在 `packages/core/src/index.ts` 导出并补齐 `tests/unit/studio/drift.test.ts`。

- [ ] T2 `[blocked-by: T1]` 实现 `llman-sdd studio drift` CLI 子命令：在 `apps/cli/src/commands/studio.ts` 挂载 `studio drift`（支持 `--trace`、`--since`、`--write-state`、`--fail-on-shadow`、`--json`/`--compact-json`/`--directory`），保持 100% 离线确定性且严格仅写 `.llman-sdd/studio/states/` 绝不静默修改 `llmanspec/specs/`，补齐临时仓库子进程测试。

- [ ] T3 `[blocked-by: T2]` 实现 Studio Web 逻辑漂移校准与反向红绿对账裁决交互：当画布经 SSE 监听到 `source === 'drift-trace'` 建议层时按注意力就近原则展示可拖拽通知卡并在画布以虚线绿边呈现 Trace 观测转移（演示触发器仅收口在 `⌘K`），在「对比 & 协商」抽屉提供「真理胜出（打开可视化 Prompt 预编辑大窗，附 Trace 证据与对象锚点）」与「追认新意图（采纳进草稿、记入时间线并防抖自动保存 → 跑对应图方言 Linter → 点『保存变更』走分支护栏）」双出口，补齐服务端与前端单测。

- [ ] T4 `[blocked-by: T2, T3]` 新增 `llman-sdd-studio-drift` skill 并完成全仓门禁验证：在 `packages/core/templates/` 新增引导外部 Agent 按 4 类直改分流法则消费 `studio drift` 最小切片包的 `llman-sdd-studio-drift` skill，执行 `init --update` 刷新 `.agents/skills/` 与 `tests/golden/` 基线，验证 `rsbuild build` 与全仓 `just qa` 全部变绿。
