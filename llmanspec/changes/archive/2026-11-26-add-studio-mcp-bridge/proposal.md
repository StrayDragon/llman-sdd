---
depends_on:
  - add-studio-cli-negotiation
title: 提供超薄 Studio MCP 包装壳与有状态扩展入口
branch: sdd/add-studio-mcp-bridge
base_branch: main
base_sha: e555d405e1d4b9bcbf48db7cccce276c3991d39d
---

# 提供超薄 Studio MCP 包装壳与有状态扩展入口

## Why

尽管 CLI + Skill 已能以极高 Token 效率覆盖大多数终端 Agent 场景，但对于无 Shell 权限的客户端（如纯对话桌面端或受限 Web IDE）、偏好强类型 JSON Schema 工具调用的用户，以及未来需要服务端主动推送、订阅唤醒或长时审批挂起等**有状态交互**，仍需要一个标准 MCP 接入层。

## What Changes

- **超薄 MCP Server（`llman-sdd studio mcp`）**：基于轻量 `@modelcontextprotocol/server`（原生兼容本仓 `zod@^4`），直接复用 C1 纯域与 C2 原子文件存储，不维护第二套业务实现；默认 `stdio` 传输（严守 `stdout` 仅输出 JSON-RPC、所有日志与警告走 `stderr`）。
- **精简核心工具映射（控制 Schema Token 税）**：薄封装暴露 5 个高频工具——`studio_list_states`、`studio_get_diff`、`studio_validate_draft`、`studio_reply_comment`、`studio_propose_revision`，读写同一份 `.llman-sdd/studio/states/` 文件，与 Studio Web 和 CLI 完全互通；不暴露直接改写 `llmanspec/specs/` 的 MCP 工具。
- **自适应多 Worktree 安全约束**：单 worktree 仓库零摩擦默认取启动目录/客户端 roots；检测到存在多个关联 worktree 时程序级强制要求显式传 `directory`（报错列出全部可用 worktree 路径），且每次返回均回显 `{ instanceRoot, branch }` 防串仓。
- **零阻力配置引导**：提供 `llman-sdd studio mcp --print-config [client]`，一键输出 Claude Code / Cursor / Codex / 通用客户端的 MCP 配置片段。
- **有状态扩展预留**：预留 `--transport http`（Streamable HTTP）及未来 `resources/subscribe`（画布主动呼叫 Agent / 焦点同步）的协议接口边界。

## Capabilities

- `studio-mcp`（新增，待 propose 阶段建 spec）：定义 `llman-sdd studio mcp` 传输纪律、核心工具契约、`--print-config` 行为与多 worktree 目录显式参数校验。
- `cli`：挂载 `studio mcp` 子命令。

## Impact

- 依赖 `add-studio-cli-negotiation` 先行收敛完整的协商动作语义与本地会话格式，确保 MCP 壳真正保持极薄（约百行级胶水）。

## Open Questions

全部核心决策已收敛并写入同目录 [design.md](./design.md)：

- **SDK 与 Zod v4 兼容**：采用拆分后的轻量 `@modelcontextprotocol/server`（原生兼容 `zod@^4.6.7`，避开早期 v1.17 兼容坑且不拉冗余客户端依赖）。
- **自适应多 Worktree `directory` 约束**：单 worktree 时 `directory` 可选（回退启动目录 / `--directory` / 客户端 roots）；检测到多 worktree 时程序级强制要求显式传 `directory` 并列出全部 worktree 路径，同时所有成功响应均回显 `{ instanceRoot, branch }`。
