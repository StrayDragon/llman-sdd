# 规则墙转图技能设计

## 命令面（以 `llman-sdd <cmd> --help` 为准）

P5 `studio coverage` 尚未合入。技能只引用：

| 步骤 | 命令 |
| --- | --- |
| 盘点图诊断 | `llman-sdd studio validate --specs` |
| 语法备忘 | `llman-sdd spec transitions` |
| 结构门 | `llman-sdd validate --specs --strict` |
| 目视 | `llman-sdd studio open` |

## 本仓与目标差异

| 项 | 现状 | 改法 |
| --- | --- | --- |
| S1 规则墙转图技能 | 无独立技能 | 新增 `llman-sdd-specs-structure.md`，登记 `OPTIONAL_SKILL_FILES`，stc 基线 0 |
| S2 onboard 流程图 | 「用步骤流转表表达」 | 改为 `@flow` + `@transitions`；第 3 步 `studio validate --specs` |
| S3 collab 深链 | 只提 Prompt 锚点 | 补 `nest` / `focus` 查询参数 |
| S5 多 Agent 落点 | 无调研 | `research/agent-surfaces.md`，不改 init |

## 选型判定表（写入技能正文）

| 判据 | 落点 |
| --- | --- |
| 生命周期明确 | 状态机 `@transitions` |
| 顺序步骤 + 条件分支 | `@flow` |
| 多条件组合判定 | 决策表（无 `@transitions`） |
| 状态内含另一台机 | `@states` 嵌套 |

选型图用 mermaid。表须与规则正文不矛盾；规则正文保留；每个新场景须有 BDD 步骤。改 specs 须走 change 且在绑定分支。

## 行数与 ethics

- 新模板 ≤ 60 行；全部技能模板最长不超过现有 `llman-sdd-wayfinder.md`（83 行）。
- 渲染产物须含 5 个 ethics 键（经 `ethics-governance` 或 `structured-protocol` 单元）。
- 改模板后 `init --update`，并 `bun run generate:skills-template-baseline`。
