---
depends_on:
  - add-studio-domain-core
title: 补齐 Studio CLI-first 双向协商子命令与 Skill 引导
branch: sdd/add-studio-cli-negotiation
base_branch: main
base_sha: c7374187bd72c5cd94acad0e514aae8a7f191457
---

# 补齐 Studio CLI-first 双向协商子命令与 Skill 引导

## Why

在终端型编码 Agent 场景下，CLI + Skill 相比 MCP 具备零常驻 Schema Token 税、零客户端配置、天然兼容多 worktree（复用 `--directory` 根发现）与极易复现调试的优势。优先把 `llman-sdd studio` 的读、校验、写回协商子命令做完备，再配合 Skill 引导，即可零门槛跑通人类草稿与 Agent 之间的 80%+ 双向协作。

## What Changes

- **纯父分组与只读/导出子命令**：新增纯父分组 `llman-sdd studio`（裸调报用法错退出码 2，对齐 `change`/`spec`/`project`/`self`；Web 工作台入口留给 C3 挂载 `llman-sdd studio serve`）；补齐 `llman-sdd studio diff [state-id]`（输出语义 Diff、评论与基于 `jsdiff` 的内存 Unified Diff 预览，支持 `--json` / 简洁人读文本，不新增 TOON 耦合）、`llman-sdd studio validate [state-id]`（支持 `--patch <path|->` 预检假设修订）、`llman-sdd studio prompt [state-id]`（输出结构化 Prompt，可选 `--copy`）、`llman-sdd studio state <list|prune>`。
- **CLI 写回协商与分支落盘子命令**：新增 `llman-sdd studio comment reply <state-id> <comment-id> --body <text>`、`llman-sdd studio revise <state-id>`（从 stdin 或 `--file` 读取 JSON 修订建议并写入 `.llman-sdd/studio/states/<id>.json`，供 Studio Web 实时监听刷新）以及 `llman-sdd studio apply <state-id>`（在绑定分支上调用 C1 纯域渲染直写 `.feature`，支持 `--dry-run` 预览 Unified Diff）。
- **CLI 契约对齐**：所有子命令严格遵守 `cli.feature`（单一 `Error:` 前缀、退出码 0/1/2、`--directory` 根发现、共享输出旗标）。
- **Skill 模板引导**：在 `packages/core/templates/` 中补充 Studio 协商指引，提示 Agent 收到草稿 ID 时优先用 `studio diff` / `validate` / `comment` / `revise` 完成核验，不擅自改写默认分支 `llmanspec/specs/`。

## Capabilities

- `cli`：新增 `studio` 协商子命令面并纳入共享输出旗标与 `--directory` 覆盖范围。
- `studio-cli`（新增，待 propose 阶段建 spec）：定义读/校验/评论回复/修订建议回推与会话管理契约。
- `init-generators`：刷新 skill 模板与 golden 基线。

## Impact

- 依赖 `add-studio-domain-core` 提供的纯域模型与本地会话读写接口。
- 与 `add-studio-web-workbench` 文件触点分离（本变更集中在 `apps/cli/` 与 `packages/core/templates/`），可并行推进。

## Open Questions

全部核心决策已收敛并写入同目录 [design.md](./design.md)：

- **纯父分组与 Web 入口**：`llman-sdd studio` 为严格纯父分组（裸调报用法错退出码 2，对齐 `change`/`spec`/`project`/`self`），Web 工作台启动命令为 `llman-sdd studio serve`（由 C3 挂载实现）。
- **状态管理与载荷格式**：对齐 C1 路径 `.llman-sdd/studio/states/<id>.json`，子命令命名为 `studio state <list|prune>`；所有新子命令不新增 TOON 耦合，`studio revise` 载荷统一采用标准 JSON（stdin 或 `--file`）。
- **`studio apply` 语义写回与强护栏**：不依赖游离 diff/patch 行号匹配，通过 Gherkin 语义定位目标场景并直接替换 `例子:` 表格；在默认分支上强拦截拒写（退出码 1，提示先 `change start`），`--dry-run` 支持任意分支零副作用预览 Unified Diff。
