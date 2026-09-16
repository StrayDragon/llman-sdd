<!-- LLMANSPEC:START -->
# LLMAN 规范驱动开发

本项目使用 llman SDD。阅读 `llmanspec/config.yaml` 了解 SDD 命令行为配置，以及 `llmanspec/AGENTS.md` 获取项目附加规则。

## SDD 流水线

使用 `/llman-sdd-explore` 开始，然后按照 pipeline：`/llman-sdd-propose` → `/llman-sdd-apply` → `/llman-sdd-verify` → `/llman-sdd-archive`。

保留此托管块，便于 `llman sdd init --update` 刷新。
<!-- LLMANSPEC:END -->

# 项目速览

llman-sdd:spec 驱动开发(SDD)工作流 CLI(Bun + TypeScript monorepo)。上方托管块由 `llman sdd init --update` 刷新,勿手改;本节及以下为项目自述,可自由维护。

- 目录:`packages/core`(纯域逻辑,副作用经接口注入)/ `apps/cli`(commander 入口)/ `tests`(unit·bdd·golden·integration)/ `llmanspec/`(规范·change·规则)
- 项目规则与技术选型定案:`llmanspec/AGENTS.md`(必读)
- 常用命令:`just qa`(静态门禁 + 全部测试)/ `just golden`(golden 四门)/ `just smoke-context`(真实 LLM 冒烟)/ `bun run build`(单二进制)
- 验收清单:`docs/acceptance-v2.md`;QA 门禁与 capture 契约:`README.md`