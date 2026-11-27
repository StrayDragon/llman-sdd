---
depends_on:
  - add-studio-web-workbench
  - add-studio-drift-trace
title: "[Post-MVP] 增强 Studio 可视化三方冲突校准与多 Agent 实时协作流"
---

# 增强 Studio 可视化三方冲突校准与多 Agent 实时协作流

## Why

C3 在「保存变更」前通过 `baseHash` 乐观锁拦截了外部 `git pull` 或其他 Agent 修改 `llmanspec/specs/` 导致的静默覆盖风险，但 MVP 阶段仅提供冲突拦截提示与重新加载/导出选择。当团队同时开启多个 Git Worktree 或多个编码 Agent 并行推进变更时，需要更直观的可视化三方合并裁决与实时协作态势感知，避免人工对照原始 `.feature` 文本解冲突。

## What Changes

- **可视化三方冲突校准（3-Way Semantic Merge）**：
  - 当 `baseHash` 检测到磁盘真理已前进时，在画布与「对比 & 协商」视图提供结构化三方比对（公共基线 `BASE` vs 本地草稿 `LOCAL` vs 磁盘最新真理 `REMOTE`）；
  - 支持按状态/转移/守卫粒度逐项采纳「保留我的草稿 / 采纳磁盘更新 / 合并二者」，裁决完成后自动重跑方言 Linter 并刷新 `baseHash`。
- **多 Worktree / 多 Agent 实时活动态势流**：
  - 利用既有 SSE 通道与 `.llman-sdd/studio/states/` 事件元数据，在顶栏工作区/时间线区域克制展示并行 Worktree 或 Agent 的最新动作（新评论回复、新虚线修订建议、新漂移对账推送），一键跳转到对应锚点对象。
- **评论 `@agent` 协作上下文增强**：
  - 在统一就近评论浮窗中支持为评论标记关注角色/待办标签，并支持一键仅打包指定未解决评论子集进入可视化 Prompt 预编辑工作台，提高多轮异步协商信噪比。

## Capabilities

- `studio-core`：新增基于 `BASE / LOCAL / REMOTE` 的纯域三方语义合并与冲突判定函数。
- `studio-web` / `studio-cli`：新增三方冲突裁决交互、多 Worktree/Agent 活动流推送与评论协作过滤增强。

## Impact

- 依赖 `add-studio-web-workbench`（`baseHash` 乐观锁、SSE 与统一评论浮窗）与 `add-studio-drift-trace`（外部修订建议层裁决范式）。
- 坚持纯域三方合并算法 100% 离线确定性，绝不静默丢弃人类或磁盘任一侧改动。

## Open Questions

- 三方冲突发生时，是否默认将当前本地草稿自动快照进时间线以便裁决失误后一键回退？
- 多 Agent 活动流如何保持视觉克制（默认折叠为状态微标，按需点开），避免破坏 Studio 低认知负担原则？
