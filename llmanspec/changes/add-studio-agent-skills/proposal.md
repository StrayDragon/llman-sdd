---
depends_on:
  - add-studio-web-workbench
  - add-studio-forest-tabs
title: "[Post-MVP] 建立面向新项目接入、陌生仓库反向学习与 Agent 协作的 Studio Skill 套件"
---

# 建立面向新项目与编码 Agent 的高效 Studio 协作 Skill 套件

## Why

Studio 将人类意图的审视、改图、评论与裁决收口到可视化工作台，但新项目首次引入 `llman-sdd` 或日常由外部编码 Agent（Claude Code / Cursor / Codex / Antigravity 等）协同工作时，仍容易出现两类摩擦：

1. **新项目冷启动门槛高**：新仓刚执行 `llman-sdd init` 时往往是 0 状态表或仅有零散需求文档，用户和 Agent 不清楚哪些业务适合建状态机/流程图/决策表、如何按 Studio 可解析的 `.feature` 表格范式起草首批规格、以及如何用 `studio open` 建立全景心智。
2. **Agent 协作姿势不统一**：面对 Studio 导出的带精确 `[定位: <图> · 对象(uid)]` 锚点 Prompt，若无精炼的 Skill 约束，Agent 容易直接越权改写 `llmanspec/specs/`、忽略 `studio comment reply` / `studio revise` 虚线建议通道、或在受保护主干分支上走错提交流程。

（注：跨语言 Runtime Trace 漂移对账专用 skill `llman-sdd-studio-drift` 已由 `add-studio-drift-trace` 承接，本草案聚焦新项目上手与日常人机协作的高效 Studio Skill 套件，职责清晰不重叠。）

## What Changes

- **`llman-sdd-studio-onboard`（新项目接入 & 陌生仓库反向提炼学习引导）**：
  - 引导 Agent 在新项目或存量/他人开源代码中，快速反向梳理核心领域边界（DDD）与关键状态机/流程图/决策表，自动生成符合 `studio-core` 解析与方言 Linter（`E1–E4` / `F1–F4`）零告警基线的首批 `llmanspec/` 规格，方便人类通过 Studio 动态业务图和单步试跑 10 分钟吃透陌生项目；
  - 指导如何结合 `llman-sdd studio open`（及 `--demo` 自举样例对照）完成首轮人机全景对齐。
- **`llman-sdd-studio-collab`（Studio 人机异步协商与不可达回执协作规范）**：
  - 规范 Agent 消费 Studio 可视化工作台导出 Prompt 与透明 HTTP GET 深链接的标准动作：精准解析 `[定位: <图> · 对象(uid)]` 与子树净 Diff、优先经 CLI（`studio comment reply`、`studio revise`、`studio report`）回写评论、虚线红绿修订建议与**意图不可达/冲突结构化回执**（零 MCP 配置门槛），严守“绝不未经人类确认静默覆盖 `llmanspec/specs/`”红线；
  - 清晰衔接分支写保护三出口（切可写 Worktree / 开新分支走 Change / 仅导 `proposal.md`）。
- **`llman-sdd-studio-review`（图规格体检与变更沉淀助手）**：
  - 指导 Agent 协助人类解读状态机/流程图 Linter 诊断、跨森林交叉桥风险与未解决评论，将 Studio 确认的业务意图无损沉淀为高质量 `proposal.md` / delta spec。
- **路由与模板集成**：
  - 在 `packages/core/templates/` 落地上述精炼、低 Token 的 skill 模板，同步更新 `llman-sdd-wayfinder` 的场景分流指引；
  - 通过 `llman-sdd init --update` 刷新 `.agents/skills/` 并对齐 `tests/golden/` 基线，确保任意新项目初始化后开箱即得完整 Studio 协作能力。

## Capabilities

- `init-generators`：新增 Studio 协作系列 skill 模板、更新 `llman-sdd-wayfinder` 路由，并纳入 `init` / `init --update` 与 `tests/golden/` 门禁。
- `studio-cli` / `studio-mcp`：在 skill 中以 CLI `--help` 与 MCP 工具契约为单一事实源，不硬编码易过期的长命令表。

## Impact

- 依赖 `add-studio-web-workbench` 与 `add-studio-forest-tabs` 落地稳定后的核心工作流、CLI/MCP 接口与全景多 Tab 交互口径。
- 仅新增/更新模板、生成物与 golden 测试，不影响运行时核心逻辑纯度。

## Open Questions

- 3 个 skill（`onboard` / `collab` / `review`）是否合并为 2 个更紧凑的 skill（例如 `llman-sdd-studio-onboard` + `llman-sdd-studio-collab`）以进一步降低新项目 skill 发现噪音与上下文 Token 占用？
- 是否需要在 `llman-sdd studio open` 启动引导或 `llman-sdd-wayfinder` 中补充面向多 Worktree 协作的简短提示？
