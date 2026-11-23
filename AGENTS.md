<!-- LLMANSPEC:START -->

# LLMAN 规范驱动开发

本项目使用 llman SDD。阅读 `llmanspec/config.yaml` 了解 SDD 命令行为配置，以及 `llmanspec/AGENTS.md` 获取项目附加规则。

## SDD 流水线

使用 `/llman-sdd-explore` 开始，然后按照 pipeline：`/llman-sdd-propose` → `/llman-sdd-apply` → `/llman-sdd-verify` → `/llman-sdd-archive`。

保留此托管块，便于 `llman-sdd init --update` 刷新。
<!-- LLMANSPEC:END -->

# 项目速览

llman-sdd:spec 驱动开发(SDD)工作流 CLI(Bun + TypeScript monorepo)。上方托管块由 `llman-sdd init --update` 刷新,勿手改;本节及以下为项目自述。

| 目录 | 职责 |
| --- | --- |
| `packages/core/` | 纯域逻辑,副作用经接口注入 |
| `apps/cli/` | commander 入口 |
| `tests/` | unit / bdd / golden / integration |
| `scripts/` | 仓库级门禁与生成脚本;首行模块注释即用途 |
| `llmanspec/` | 规范、change、项目规则 |

- 项目规则、技术选型、文风:`llmanspec/AGENTS.md`
- 门禁入口:`just qa`(等价 CI,默认静默;`just QA_VERBOSE=2 qa` 排障)。单门 `qa-` 前缀;其余 recipe 以 justfile 注释为准
- 过程性结论不落独立文档;强约束收敛至 `llmanspec/AGENTS.md`
