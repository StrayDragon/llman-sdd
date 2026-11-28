---
depends_on: []
title: 沉淀 Studio 纯域图模型、语义 Diff 与本地草稿会话底座
branch: sdd/add-studio-domain-core
base_branch: main
base_sha: 40d7a9e07da3962392359f87e967d61d09a046fd
---

# 沉淀 Studio 纯域图模型、语义 Diff 与本地草稿会话底座

## Why

Studio 的 Web 工作台、CLI 协商命令与 MCP 包装壳必须共享同一套领域逻辑，避免前端另写正则解析 `.feature`、或三端各自维护一套语义 Diff 与校验规则导致行为分叉。先在 `packages/core` 建立零 UI、零框架耦合的纯域底座，可以让后续 CLI 与前端并行推进并由纯单测钉死契约。

## What Changes

- **统一状态机图 IR**：基于本仓已有的 `@statelyai/graph`，定义从 `.feature` 纳管状态流转表投影出的纯 JSON 状态机图模型（含状态、转移 `from/event/to/guard`、会话内稳定 `uid` 与语义锚点）。
- **语义 Diff 引擎（忽略坐标、识别改名）**：对比基线图与暂存草稿，精准产出 `states`（新增/删除/重命名）与 `transitions`（新增/删除/事件或守卫或目标修改），纯布局坐标变更不进入 Diff。
- **图元锚定评论与 Agent 修订建议层**：定义绑定在稳定语义锚点上的评论线程与独立建议补丁（`RevisionProposal`），Agent 修订建议不直接覆盖人类草稿，支持逐条采纳或忽略。
- **复用既有门禁与内置样例**：直接复用 `packages/core/src/validation/xstateTransitions.ts` 的发现与 E1–E4 校验；提供 2 套内置样例状态机供 0 状态表仓库的 `--demo` 模式与单测使用。
- **本地暂存状态与绑定分支落盘纯域能力**：定义 `.llman-sdd/studio/states/<id>.json`（统一归入 `.llman-sdd/` 本地运行目录，默认 `.gitignore`）的草稿状态读写与布局 sidecar 端口接口（I/O 经接口注入，保持 `packages/core` 纯域纪律）；提供导出合规 `llmanspec/changes/<id>/proposal.md`（语义 Diff 摘要）的纯域组装能力，以及在 `change start [--worktree]` 绑定分支上直接无损更新 `.feature` 表格的纯函数（辅以 `jsdiff >= 8.0.3` 实时内存 Unified Diff 预览，不存游离 `specs.patch` 文件、不新增 TOON 耦合）。

## Capabilities

- `studio-core`（新增，待 propose 阶段建 spec）：定义状态机图 IR、语义 Diff、锚定评论、修订建议层、草稿会话模型与 Change 导出组装契约。
- `validation`：确保既有状态流转发现与 E1–E4 校验函数可被 Studio 纯域直接复用。

## Impact

- 本提案为 Studio 6 节点 Change DAG 的根节点（C1），完整产品愿景见同目录 [PRD.md](./PRD.md) 与 [research/](./research/) 调研清册。
- 纯 `packages/core` 域逻辑，不引入 Web 打包依赖，不修改 `llmanspec/specs/`（当前仍为 draft 阶段）。

## Open Questions

全部核心决策已收敛并写入同目录 [design.md](./design.md)：

- **本地草稿路径**：统一为 `.llman-sdd/studio/states/<id>.json`（默认 `.gitignore`，归入 `.llman-sdd/` 本地运行目录，取代 `sessions` 命名便于扩展）。
- **草稿粒度**：1 个 state 文件 = 1 次业务变更草稿，支持包含 1 张或多张状态机（默认单张起手，天然衔接跨业务森林变更）。
- **草稿来源**：同时支持演进已有 `.feature` 状态表（`mode: modify`）与从零新建状态机（`mode: create`，`baseline: null`）。
- **「保存为 Change」与分支落地策略**：不生成易过期的游离 `specs.patch` 文件；探索/协商期仅存本地 `.llman-sdd/studio/states/<id>.json` 与可选 `proposal.md` 草案（含极简语义 Diff 摘要）；正式落地 `llmanspec/specs/` 严格复用 `llman-sdd` 原生 `change start [--worktree]` 绑定分支模式，在绑定分支上调用纯域无损表格更新函数直写 `.feature`，多并行开发与分叉对比完全依托 Git graph / merge-base；`diff`（`jsdiff >= 8.0.3`）仅用于内存 Unified Diff 实时预览，零 TOON 耦合。
- **并发安全与改名追踪**：写盘采用临时文件 + 原子 `rename`；草稿内通过稳定 `uid` 识别状态改名，跨进程修订补丁显式支持 `rename_state` op。
