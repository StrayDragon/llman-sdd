---
depends_on:
  - add-studio-domain-core
  - add-studio-web-workbench
title: 建立跨语言 Runtime Trace 漂移对账与反向建议 Diff 闭环
---

# 建立跨语言 Runtime Trace 漂移对账与反向建议 Diff 闭环

## Why

现实研发中，人类或 Agent 难免会绕过 SDD 流程直接修改代码（重构、紧急 hotfix、补边界或偷改守卫）。仅靠正向 BDD 测试只能抓破坏既有行为的错误，抓不住“测试全绿但代码偷偷多出未登记后门状态/转移”的静默漂移；同时 `llman-sdd` 面向跨语言技术栈，不能绑定单一语言 AST 或消耗海量 Token 全仓扫代码。

## What Changes

- **0-Token 跨语言 Runtime Trace 对账协议**：定义极简语言无关 JSONL 迁移日志格式（`{"machine":"...","from":"...","event":"...","to":"..."}`），由 `packages/core` 将真实运行轨迹与 `llmanspec/specs/` 状态机确定性比对，0 Token 检出「未登记后门转移（Shadow Transition）」与「零覆盖纸面规格（Dead Spec）」。
- **`@llmanspec:` 语义注释锚点与波及反查**：约定跨语言通用代码注释锚点（如 `// @llmanspec:r34`、`# @llmanspec:machine:<id>`，严格避开裸 `llman` 前缀），结合 `git diff` 0 Token 定位直接改代码命中的最小规格集合，为后续极低 Token 最小切片语义检查提供入口。
- **4 类直改代码分流与 Studio「反向红绿对账 Diff」**：发现代码与规格漂移时绝不自动静默覆写 `llmanspec/specs/`，而是通过 `llman-sdd studio drift --write-state` 将观测到的新增状态/边封装为「反向建议 Diff（Reconciliation Proposal）」写入 `.llman-sdd/studio/states/` 并在 Studio 红绿呈现，由人类显式裁决：**真理胜出（修代码）** 或 **追认新意图（一键落为补录 Change）**。
- **离线确定性 + 配套 Skill（`llman-sdd-studio-drift`）**：CLI 保持 100% 离线确定性（零内置 LLM API/Key），按需输出极小的「最小切片裁决包」；配套新增 `llman-sdd-studio-drift` skill 引导用户常用的编码 Agent 按 4 类分流法则消费切片包并与 Studio 协作。

## Capabilities

- `studio-core` / `studio-cli` / `studio-web`：新增 Runtime Trace 对账、`@llmanspec:` 锚点波及切片、`llman-sdd studio drift` 子命令与 Studio 反向对账 Diff 人类裁决交互。
- `init-generators`：新增 `llman-sdd-studio-drift` skill 模板并刷新 `.agents/skills/` 与 `tests/golden/` 基线。

## Impact

- 依赖 `add-studio-domain-core`（语义 Diff 与会话模型）及 `add-studio-web-workbench`（红绿建议层可视化裁决）。
- 100% 跨语言协议（JSONL + 通用注释 + `git diff`），日常检测保持 0 Token 开销。

## Open Questions

全部核心决策已收敛并写入同目录 [design.md](./design.md)：

- **命令挂载**：采用独立子命令 `llman-sdd studio drift --trace <file.jsonl> [--since <git-ref>] [--write-state] [--fail-on-shadow]`，保持 `llman-sdd validate` 纯净。
- **反模糊扫描与 100% 离线确定性**：借鉴 `bloc/` 实验教训，CLI 绝不内置网络 LLM API 或自由模糊扫描；仅基于 0-Token 确定性事实（JSONL Trace、`@llmanspec:` 锚点与 `git diff`）输出「最小切片裁决包」，交由配套的 `llman-sdd-studio-drift` skill 引导用户习惯的外部 Agent 协作处理；内置语义检索等能力留待真实痛点清晰后另立 change 演进。
