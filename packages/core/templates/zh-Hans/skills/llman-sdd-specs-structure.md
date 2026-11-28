---
name: "llman-sdd-specs-structure"
description: "规格大段规则文字需要在 Studio 看见行为逻辑时使用。把规则墙转成状态机、流程图、决策表或嵌套子机。不用于日常提案立项。"
metadata:
  version: "{{ llman_version }}"
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

{{ unit("skills/cli-footer") }}

{{ unit("skills/ethics-governance") }}
