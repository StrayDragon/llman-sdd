# 调研：Claude Code / Cursor / Codex / Antigravity 的项目级 Skills 与 MCP

访问日一律 **2026-11-28**。论断只来自下方官方页或本仓库源码；官方页未写明的标「未核实」。

## 本仓库现状（只读）

`packages/core/src/init/init.ts` 把托管技能写到 `.agents/skills/<name>/SKILL.md`（`SKILLS_BASE = '.agents/skills'`）；部分技能另写 `agents/openai.yaml`（`allow_implicit_invocation: false`）。`packages/core/src/init/defaultConfig.ts` 注释写明「内置技能由 llman-sdd init --update 全部写入 `.agents/skills/`」。

`apps/cli/src/commands/studioMcp.ts`：`studio mcp --print-config` 客户端为 `claude-code | cursor | codex | generic`。`codex` 输出 TOML `[mcp_servers.llman-sdd-studio]` + `command`/`args`；其余输出 JSON `mcpServers` 包装。无 `antigravity`。init 不写 MCP 配置文件。

## 对照

| 产品 | 官方项目级 skills 目录 | 是否读取 `.agents/skills` | 项目级 MCP 位置 / 格式 |
| --- | --- | --- | --- |
| Claude Code | `.claude/skills/<name>/SKILL.md` | 官方发现表未列入；是否读取 **未核实** | 仓库根 `.mcp.json`，JSON `mcpServers` |
| Cursor | `.agents/skills/` **与** `.cursor/skills/` | **是** | `.cursor/mcp.json`，JSON `mcpServers` |
| Codex | `.agents/skills`（CWD 上溯至仓库根） | **是** | `~/.codex/config.toml` 或受信任项目的 `.codex/config.toml`，TOML `[mcp_servers.<name>]` |
| Antigravity | `<workspace>/.agents/skills/<name>/` | **是** | `<workspace>/.agents/mcp_config.json`，JSON `mcpServers` |

## Claude Code

项目级约定：每项技能是目录，内含 `SKILL.md`。官方表（[Extend Claude with skills](https://docs.claude.com/en/docs/claude-code/skills)，与 [code.claude.com 同页](https://code.claude.com/docs/en/skills)）：

> Project | `.claude/skills/<name>/SKILL.md` | Sessions in this repository.

另有 Personal `~/.claude/skills/`、嵌套 `<subdir>/.claude/skills/`、`--add-dir` 下的 `.claude/skills/`、插件路径。该页与 [Explore the .claude directory](https://code.claude.com/docs/en/claude-directory) **均未出现** `.agents/skills`。因此：**官方宣称的发现路径不含 `.agents/skills`；运行时是否仍扫描该目录，未核实。**

MCP（[Connect Claude Code to tools via MCP](https://docs.claude.com/en/docs/claude-code/mcp)，同 [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp)）：

> Project-scoped servers … `.mcp.json` file at your project's root directory.

格式为 `{"mcpServers": { "<name>": { … } }}`。HTTP 须带 `"type": "http"`；「A JSON entry that has a `url` but no `type` is a configuration error, because Claude Code reads an entry with no `type` as a stdio server。」stdio 可用 `command`/`args`（可写 `"type": "stdio"`）。交互会话会提示批准项目级 `.mcp.json`。

## Cursor

[Agent Skills](https://cursor.com/docs/skills) 项目级两处并列：

> `.agents/skills/` | Project-level  
> `.cursor/skills/` | Project-level

并写：「For compatibility, Cursor also loads skills from Claude and Codex directories: `.claude/skills/`, `.codex/skills/` …」用户级：`~/.agents/skills/`、`~/.cursor/skills/`。示例树以 `.agents/skills/my-skill/SKILL.md` 为规范形态。frontmatter 要求 `name`（须与父目录同名）与 `description`。

MCP（[Model Context Protocol](https://cursor.com/docs/mcp)）：

> Create `.cursor/mcp.json` in your project for project-specific tools.  
> Create `~/.cursor/mcp.json` in your home directory …

根对象 `mcpServers`。stdio 示例用 `command`/`args`/`env`；远程用 `url`。同页 STDIO 表把 `type` 标为 Required（`"stdio"`），示例却常省略 `type`——**缺 `type` 的项目文件是否被接受，未核实。**

## Codex

产品页 [Build skills](https://developers.openai.com/codex/skills)（落地 [learn.chatgpt.com/docs/build-skills](https://learn.chatgpt.com/docs/build-skills)）：

> For repositories, Codex scans `.agents/skills` in every directory from your current working directory up to the repository root.

REPO 三档均为 `.agents/skills`（CWD / 父目录 / `$REPO_ROOT`）；USER 为 `$HOME/.agents/skills`。Customization 页再钉一句：「Put repo skills in `.agents/skills`」（[Customization](https://learn.chatgpt.com/docs/customization/overview)）。

一份官方博客示例把仓库技能写到 `.codex/skills/…`（[Testing Agent Skills Systematically with Evals](https://developers.openai.com/blog/eval-skills)）。**产品发现表未列 `.codex/skills`；该路径是否仍被加载，未核实。** 以 Build skills 表为准：项目级 SSOT 是 `.agents/skills`。

MCP（[Model Context Protocol](https://developers.openai.com/codex/mcp) → [learn.chatgpt.com/docs/extend/mcp](https://learn.chatgpt.com/docs/extend/mcp)）：

> Codex stores MCP configuration in `config.toml` … By default this is `~/.codex/config.toml`, but you can also scope MCP servers to a project with `.codex/config.toml` (trusted projects only).

stdio：`command` 必填，`args`/`env`/`cwd` 可选。示例形态：

```toml
[mcp_servers.docs]
command = "docs-server"
args = ["--port", "4000"]
```

（摘自 [Sample Configuration](https://learn.chatgpt.com/docs/config-file/config-sample)）HTTP 用 `url`。CLI：`codex mcp add <name> -- <stdio command>`。

## Antigravity

[Agent skills](https://antigravity.google/docs/skills/)：

> Antigravity defaults to `.agents/skills`, but still maintains backward compatibility for `.agent/skills`.

工作区路径：`<workspace>/.agents/skills/<skill>/`；全局 `~/.gemini/config/skills/`。会沿父目录读到仓库根的 `.agents/skills/`。[Customization discovery](https://antigravity.google/docs/customization-discovery/)：skills 为 `skills/<name>/SKILL.md`；「scans each customization folder one level deep」——技能目录须直接位于 `skills/` 下（与当前 init 布局一致）。另认 `.agent/`、`_agents/`、`_agent/`，「Use `.agents/` for new projects。」

MCP（[MCP](https://antigravity.google/docs/mcp/)）：工作区 `<workspace>/.agents/mcp_config.json`，全局 `~/.gemini/config/mcp_config.json`。根对象 `mcpServers`。stdio：`command` + `args`；远程：`serverUrl`（`url` 亦可）。

## 建议：init 要不要加 `--agent`

**不要把 `--agent` 做成替换 `.agents/skills` 的写入目标。** Cursor、Codex、Antigravity 官方项目级路径都包含 `.agents/skills`；当前 init 已打在三者交集上。Claude Code 官方只认 `.claude/skills/`，这是唯一需要额外落点的产品。

MCP 不要并进 `init --agent`：批准/信任语义各异（Claude 项目 `.mcp.json` 要交互批准；Codex 项目 `config.toml` 仅 trusted；Cursor/Antigravity 文件路径不同）。继续用 `studio mcp --print-config`，并补 `antigravity`。

### 最小设计草案（不实现）

1. **默认不变**：`init` / `init --update` 仍只写 `.agents/skills/<llman-sdd-*>/SKILL.md`。
2. **可选** `--agent <target>`，`target ∈ {claude-code, cursor, codex, antigravity, all}`。  
   - `claude-code` 或 `all`：在保留 `.agents/skills` 的前提下，把同一批托管技能再落到 `.claude/skills/<name>/SKILL.md`（复制；是否改用 symlink **未核实** Claude 对 symlink 的项目技能支持——官方只写「a `<name>` entry … can be a symlink」，未覆盖整树镜像）。  
   - `cursor` / `codex` / `antigravity`：不另写技能目录；stderr 可提示 MCP 用 `studio mcp --print-config <client>`。
3. **`studio mcp --print-config`**：增加 `antigravity`，snippet 为 `.agents/mcp_config.json` 形态的 `mcpServers` + `command`/`args`。`claude-code`/`cursor` 维持 JSON；`codex` 维持 TOML。init 仍不落盘 MCP 文件。
4. **不要**为 Cursor 再写一份 `.cursor/skills/`，为 Codex 再写 `.codex/skills/`：前者官方已读 `.agents/skills`；后者产品表未列 `.codex/skills`。

待决策：Claude 镜像用复制还是官方所述的单技能 symlink；`--agent` 缺省值是省略还是 `all`。
