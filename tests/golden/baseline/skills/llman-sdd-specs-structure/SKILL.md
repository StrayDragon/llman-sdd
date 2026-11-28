---
name: "llman-sdd-specs-structure"
description: "规格大段规则文字需要在 Studio 看见行为逻辑时使用。把规则墙转成状态机、流程图、决策表或嵌套子机。不用于日常提案立项。"
metadata:
  version: "0.1.0"
---

# LLMAN SDD Specs Structure

把规则墙落成 Studio 可解析的表格规格。依据规则正文与代码落表，不得编造转移。

## Workflow

1. 盘点：`llman-sdd studio validate --specs`，再 `llman-sdd list --specs` 选一个候选能力。
2. 按判定表选型并落表。
3. 查语法：`llman-sdd spec transitions`。
4. 结构门：`llman-sdd validate --specs --strict`。
5. 目视：`llman-sdd studio open`。

| 判据 | 落点 |
| --- | --- |
| 生命周期明确 | 状态机 `@transitions` |
| 顺序步骤与条件分支 | 流程图 `@flow` |
| 多条件组合判定 | 决策表（无 `@transitions`） |
| 状态内含另一台机 | `@states` 嵌套 |

```mermaid
flowchart LR
  wall[规则墙] --> pick[选型]
  pick --> table[落表]
  table --> check[校验]
```

## Constraints

- 改 `llmanspec/specs/` 必须走 change 并在绑定分支编辑，不得在默认分支直接改写。
- 表必须与规则正文不矛盾；规则正文保留。
- 每个新场景必须有可被 `bun test tests/bdd` 执行的步骤。

> 命令细节用 `llman-sdd <cmd> --help` 查看；命令参考以 CLI 为准，skill 不内嵌命令表。
> 文中“规约”= 本项目 `llmanspec/specs/` 下的 `.feature` 文件；用 `llman-sdd list --specs` / `llman-sdd show <capability>` 查全文。

## Ethics Governance
- `ethics.risk_level`：low——只读写本仓库与 `llmanspec/`，无外发动作；正文另有声明时按正文执行。
- `ethics.prohibited_actions`：违反正文硬约束的动作；用户未明确要求时，不得 push、发 PR 或向外部上传。
- `ethics.required_evidence`：结论必须给出命令输出或文件路径；门禁状态以 `llman-sdd validate` 输出为准。
- `ethics.refusal_contract`：门禁 CRITICAL 未清零时，不得进入下一阶段；自修复达到上限时，报告 blocker。
- `ethics.escalation_policy`：改动 SDD 合约、模板，或执行不可逆动作前，必须先取得用户确认。
