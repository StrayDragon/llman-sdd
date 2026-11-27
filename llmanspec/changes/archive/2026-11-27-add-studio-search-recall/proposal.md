---
depends_on:
  - add-studio-web-workbench
  - add-studio-forest-tabs
title: "[Post-MVP] 扩展 Studio 面板内搜索与工作区深度搜索召回（含 RAG 语义槽位）"
branch: sdd/add-studio-search-recall
base_branch: main
base_sha: 33addbc5340623e560f0a5cdd2e79ad1f38a2a16
---

# 扩展 Studio 面板内搜索与工作区深度搜索召回（含 RAG 语义槽位）

## Why

C3/C5 已通过 `⌘K` 与 `+ 新标签页` 提供了工作区实时规格名、嵌套状态/步骤直跳与命令检索，但当业务仓库增长到数十份规格、长规则文档或数百条状态转移与评论时，人类仍面临两类高频检索痛点：

1. **当前画布/文档内局部定位慢**：在 30+ 节点的大图、多层嵌套子图或长规则/决策表中，需要像浏览器/IDE 一样的**面板内搜索（`⌘F`）**来即时高亮命中项并逐条居中跳转，而不是反复缩放肉眼扫描。
2. **跨文档深层语义召回不足**：仅按标题/标签字面匹配无法快速回答“哪些规则涉及超时退回”“哪条评论讨论过幂等锁”这类自然语言或正文检索诉求；需要按 C3 预留的 `SearchProvider` 插槽平滑接入全文倒排与可选外部 RAG 语义召回，同时保持 0 外部依赖的本地兜底。

## What Changes

- **面板内搜索（`⌘F` / In-Panel Find）**：
  - 在宏观全景画布、状态机/流程图画布、规则文档与决策真值表内统一支持 `⌘F` 呼出紧凑就近搜索条（遵循注意力就近原则，不挤占画布主视觉）；
  - 实时匹配当前视图的节点名、事件/守卫标签、规则条款正文、决策表单元格及关联评论内容，画布端高亮命中图元并淡化无关背景，支持 `Enter` / `Shift+Enter` 逐条平滑居中定位与命中计数（`i / N`）。
- **工作区深度全文召回（Tier 0，本地确定性 0 依赖）**：
  - 在 `SearchProvider` 中新增本地轻量倒排/BM25 检索，按当前工作区实例隔离索引规则正文、Scenario 步骤、守卫表达式、未解决/已解决评论及时间线变更摘要；
  - 在 `⌘K` 与 `+ 新标签页` 返回带命中片段摘要与直跳锚点的排序结果。
- **可选外部 RAG 语义召回代理（Tier 1，复用 TextFold 双层架构）**：
  - 落地 C3 预留的 `RAG 语义检索` Provider 槽位：仅当用户通过环境变量或 `llmanspec/config.yaml` 显式配置外部 RAG/Embedding serve 时，经 `studio serve` 同源薄代理转发查询并做本地短期缓存；
  - 外部服务未配置或超时不可达时无感降级回 Tier 0 本地全文召回，并在 UI 清晰标识当前召回来源（`RAG 语义` / `本地全文`），零内置大模型 Key 耦合。

## Capabilities

- `studio-web`：新增画布/文档面板内搜索（`⌘F`）、高亮定位导航，以及 `SearchProvider` 的全文倒排与 RAG 语义召回展示契约。
- `studio-cli` / `studio-core`：扩展本地回环服务检索索引接口与可选外部 RAG serve 代理转发及降级机制。

## Impact

- 依赖 `add-studio-web-workbench`（`SearchProvider` 抽象槽与本地回环服务）与 `add-studio-forest-tabs`（全景与多工作区多 Tab 视图）。
- 完全向后兼容现有离线 0-Token 默认体验；外部 RAG 服务为纯可选增强。

## Open Questions

- 面板内搜索 `⌘F` 是否同步穿透检索当前状态机下的 L2/L3 嵌套子图，并在跳转时自动下钻定位？
- 外部 RAG serve 的最小通用 HTTP 请求/响应契约（如 `{ query, workspaceKey, topK }` → `{ hits: [{ targetKind, targetId, score, snippet }] }`）如何保持最简且易于社区/用户自建服务适配？
