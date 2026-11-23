---
depends_on:
  - unify-command-surface
title: 移除索引与语义检索
---

# 移除索引与语义检索

## Why

`index rebuild` 写出的 pageindex 树只有 `context` 在读。`context` 又要求 `LLMAN_SDD_INDEX_CHAT_MODEL`。模型没配时，技能已经退回 `list --specs` 再直读 `.feature`，这也是今天的默认路径。两组命令加上一套 API 环境变量，维护的是一条大多数仓库走不到的检索。

## What Changes

- 删除 `index` 与 `context` 命令，以及 `--backend`、`LLMAN_SDD_INDEX_BACKEND`、`LLMAN_SDD_INDEX_CHAT_*`、`LLMAN_SDD_INDEX_OPENAI_*`。`rag` 的报错路径一起删除。
- 删除 `context-index` 能力规格。在 `cli` 上加一条可执行场景：调用 `index` 或 `context` 是未知命令，退出码 2。
- 删除技能单元 `skills/index-fallback`，以及各技能模板里对它的引用。技能改为直接 `list --specs` 再读 `.feature`。
- 版本戳从 `llmanspec/.context/sdd-state.json` 挪到 `llmanspec/.sdd-state.json`。读取时先看新路径，没有则看旧路径，避免一次升级把已记录的 CLI 版本弄丢。`init` 与 `init --update` 只写新路径。
- `migrations/v0.10-v0.11/README.md` 说明这两个命令已移除，环境变量可以删掉。规格文件仍是事实来源。

## Capabilities

- `context-index`：删除该能力。
- `cli`：`index` 与 `context` 为未知命令。
- `init-generators`：版本戳的新路径，以及旧路径的只读回退。

## Impact

- 依赖 `unify-command-surface`，避免和命令改名同时改技能模板。
- 规格很多、又已经接了聊天模型的仓库失去语义检索。检索结果本来就可以从 `.feature` 重读，没有单独的用户数据要迁移。
- `.context/pageindex/` 成为无人读取的目录。`init --update` 不主动删除它。升级说明里告诉用户可以自行删掉。
