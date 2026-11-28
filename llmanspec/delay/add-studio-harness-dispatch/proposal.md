---
depends_on:
  - add-studio-web-workbench
  - add-studio-drift-trace
title: "[Post-MVP] 可选接入 OAR 直派本机 Agent Harness 与流式观测验收"
---

# 可选接入 OAR 直派本机 Agent Harness 与流式观测验收

## Why

MVP 阶段采用「可视化零盲复制 Prompt + 透明 HTTP GET 深链接 + CLI/Skills」零配置闭环，保证零外部运行时耦合、可无缝对接用户任意工作流。但在高频反复改图与大范围 DDD 调整场景下，人类不断在浏览器与编码 Agent 窗口之间手动复制粘贴 Prompt 会持续打断注意力、拖慢 human-in-the-loop 效率。

需要一条**纯可选的减摩擦通道**——在不把 `llman-sdd` 变成大而全 Agent 平台的前提下，允许用户在 Prompt 预编辑大窗一键把锁定后的意图直接派发给本机已有的编码 Agent Harness（如 Antigravity / Claude Code / Codex / Cursor / OpenCode / Kimi Code 等），在 Studio 内实时观测进度并自动回流确定性验收结果。

## What Changes

- **接入 `@botiverse/oar`（Open Agent Runtime）作为可选 Harness 派发 Provider**：
  - 在 C3 Prompt 预编辑工作台的 `DispatchProvider` 插槽中新增「直派本机 Agent」动作（旁置「复制 Prompt」与「透明分享链接」，不强制启用）；
  - 经本地 `studio serve` 调用 `@botiverse/oar` 驱动用户本机已安装/已登录的编码 Agent Harness（不内置大模型 API Key、不重复造 Agent 壳），显式校验能力支持，遇不支持选项按 OAR 契约明确报错而非静默吞错。
- **浏览器内流式进度观测与自动验收回流**：
  - 复用 `@botiverse/oar/observe` 将 Agent 执行事件流折叠为克制的 UI 观测条（当前步骤、耗时、取消/转向控制，遵循注意力不打扰原则）；
  - Agent 执行完毕后自动触发 Studio 的确定性验收单（比对 `INTENT` vs `DELIVERED` 图结构一致度、方言 Linter、BDD/Trace 覆盖度）并收集结构化回执（`verified` / `blocked` 不可达原因 / `counter_proposal` 替代图方案）。
- **可选轻量辅助槽位（Vercel AI SDK）**：
  - 仅在用户显式配置外部推理端点时，为非确定性文本辅助（如跨模块审阅摘要）提供轻量接口，核心图 IR、Diff、Linter 与验收对账保持 100% 离线确定性。
- **明确职责边界（非目标）**：
  - 不内置外部事件自动化流水线（如 GitHub Issue 自动审批触发）；外部系统编排继续通过 `llman-sdd` 稳定 CLI / JSON / HTTP 原子接口集成。

## Capabilities

- `studio-web`：在 Prompt 工作台增加可选 Harness 派发入口、流式执行观测条与执行完毕自动验收回流。
- `studio-cli`：在本地回环服务提供可选 OAR Harness 适配与事件流 SSE 推送端点。

## Impact

- 依赖 `add-studio-web-workbench`（Prompt 预编辑工作台、意图锁定、SSE）与 `add-studio-drift-trace`（反向建议与结构化回执裁决范式）。
- 严格作为 Post-MVP 可选能力，未配置 Harness 时 100% 回落到 MVP 的复制 Prompt / URL 直读主路径。

## Open Questions

- OAR 派发任务时默认在当前可写 Worktree 执行，还是支持勾选「为本次意图自动新开临时 Worktree 沙箱执行，验收通过后再合并」？
- 是否提供基于 `@botiverse/oar/testing` 的离线脚本化假运行时用于 CI 端到端回归测试？
