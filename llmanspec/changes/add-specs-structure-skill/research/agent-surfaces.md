# Agent 面 skills 与 MCP 落点调研

访问日期：2026-11-28。只引官方文档；官方未写的标「未核实」。本仓现状：`init` 只写 `.agents/skills`（init-generators「init 逐根与 agent 面 skills 策略」）；`studio mcp --print-config` 支持 `claude-code|cursor|codex|generic`（`apps/cli/src/commands/studioMcp.ts`）。

## Claude Code

| 断言 | 来源 |
| --- | --- |
| 项目级 skills 在仓库 `.claude/skills/<name>/SKILL.md`；个人在 `~/.claude/skills/` | [Explore the .claude directory](https://code.claude.com/docs/en/claude-directory) |
| Agent SDK 同样从 `.claude/skills/` 与 `~/.claude/skills/` 发现 | [Extend agents with skills](https://code.claude.com/docs/en/agent-sdk/skills) |
| 是否读取 `.agents/skills` | **未核实**。上述官方页未列出该路径 |
| 项目 MCP：仓库根 `.mcp.json`；个人 MCP：`~/.claude.json` | [Explore the .claude directory](https://code.claude.com/docs/en/claude-directory) |

## Cursor

| 断言 | 来源 |
| --- | --- |
| 项目级读取 `.agents/skills/` 与 `.cursor/skills/`；用户级 `~/.agents/skills/` 与 `~/.cursor/skills/` | [Agent Skills](https://cursor.com/docs/skills) |
| 兼容扫描 `.claude/skills/` 与 `.codex/skills/` | 同上 |
| 项目 MCP：`.cursor/mcp.json`；全局：`~/.cursor/mcp.json`；`mcpServers` + `command`/`args` 或 `url` | [Model Context Protocol (MCP)](https://cursor.com/docs/mcp)、[MCP integrations](https://cursor.com/help/customization/mcp) |

## Codex

| 断言 | 来源 |
| --- | --- |
| 仓库 skills：从 cwd 向上到仓库根扫描 `.agents/skills`；个人：`~/.agents/skills` | [Build skills](https://learn.chatgpt.com/docs/build-skills)、[Customization](https://learn.chatgpt.com/docs/customization/overview) |
| 是否还扫 `.codex/skills` 作为现行默认 | **未核实**。Customization 表只列 `.agents/skills` / `~/.agents/skills` |
| MCP：`~/.codex/config.toml` 或受信项目 `.codex/config.toml` 的 `[mcp_servers.<name>]`（`command`/`args` 或 `url`） | [Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp) |

## Antigravity

| 断言 | 来源 |
| --- | --- |
| 工作区默认 `.agents/skills/<skill>/SKILL.md`；兼容 `.agent/skills`；个人 `~/.gemini/config/skills/` | [Agent skills](https://antigravity.google/docs/skills/)、[Customization discovery](https://antigravity.google/docs/customization-discovery/) |
| 读取 `.agents/skills`：是 | 同上 |
| MCP：工作区 `.agents/mcp_config.json`；全局 `~/.gemini/config/mcp_config.json`；`mcpServers` + `command` 或 `serverUrl` | [MCP](https://antigravity.google/docs/mcp/) |

## 是否给 init 加 `--agent`

**建议：现在不加。** Cursor、Codex、Antigravity 官方均扫描 `.agents/skills`，与当前 init 落点一致。Claude Code 官方只写 `.claude/skills`，若要零配置覆盖 Claude，最小草案是可选 `--agent claude-code` 把同一套 `SKILL.md` 再写（或符号链接）到 `.claude/skills/<stem>/`，默认行为不变。MCP 三家格式不同（JSON `.mcp.json` / `.cursor/mcp.json` / Antigravity `mcp_config.json` vs Codex TOML）；本仓已有 `studio mcp --print-config`，不必让 init 写 MCP。不实现本草案。
