# 项目速览

llman-sdd:spec 驱动开发(SDD)工作流 CLI(Bun + TypeScript monorepo)。本节为项目自述。

| 目录 | 职责 |
| --- | --- |
| `packages/core/` | 纯域逻辑,副作用经接口注入 |
| `apps/cli/` | commander 入口 |
| `tests/` | unit / bdd / golden / integration |
| `scripts/` | 仓库级门禁与生成脚本;首行模块注释即用途 |
| `llmanspec/` | 规范、change、项目规则 |

- 项目规则、技术选型、文风:`llmanspec/AGENTS.md`
- 门禁入口:`just qa`(等价 CI,默认静默;`just QA_VERBOSE=2 qa` 排障)。单门 `qa-` 前缀须被 qa 聚合;其余 recipe 以 justfile 注释为准
- 过程性结论不落独立文档;强约束收敛至 `llmanspec/AGENTS.md`
