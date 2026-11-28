---
name: "llman-sdd-studio-onboard"
description: "新项目首次接入 Studio 或接手陌生仓库需反向提炼业务图谱时使用。产出可解析的 .feature 表格规格并拉起 Studio。不用于常规需求提案。"
metadata:
  version: "0.11.0"
---

# LLMAN SDD Studio Onboard

把新项目或陌生仓库的关键业务可视化。整理出可被 Studio 解析与单步推演的首批 `llmanspec/specs/` 规格。

## 反向提炼流程

1. **划分领域边界**：读取目录结构、入口模块与数据模型。提炼 3–6 个职责清晰的业务能力（capability），避免塞进单一规格。
2. **按四类图谱落盘规格**：
   - **状态机**（生命周期明确）：`@transitions` 标注 `场景大纲:`，列头 `from | event | to`（或中文列头）。
   - **流程图**（顺序步骤与条件分支）：`@flow` 与 `@transitions` 同挂。
   - **决策表**（多条件组合判定）：无 `@transitions` 的 `场景大纲:`，至少两行条件列与结果列。
   - **嵌套**（状态内含另一台机）：`@states` 表格列 `状态 | 子机`，子机格写 `@req:<id>`。
3. **零告警基线自检**：
   - 运行 `llman-sdd validate --specs` 确认结构与 `@req:<id>` 合法。
   - 运行 `llman-sdd studio validate --specs` 检查抽取图诊断，确保无阻断错误。
4. **打开全景工作台核对**：运行 `llman-sdd studio open` 打开当前工作区主视图。多 Worktree 时在各目录分别运行，会自动复用本机单一 Hub。

最小可抽取示例：

```gherkin
# language: zh-CN
# purpose: order
功能: order
  @req:r1
  规则: 订单
    订单按表流转。
    @transitions
    场景大纲: 主流程
      假如 当前处于 <from>
      当 触发 <event>
      那么 流转至 <to>
      例子:
        | from | event | to |
        | 草稿 | 提交 | 待审 |
        | 待审 | 通过 | 完成 |
```

## 边界约束

- 不得 脱离真实代码编造不存在的状态转移或守卫条件。
- 不得 在默认分支未经人类确认直接覆盖已有 `llmanspec/specs/`；若仓内已有规格，宜先用 `llman-sdd change start <id>` 绑定特性分支。

> 命令细节用 `llman-sdd <cmd> --help` 查看；命令参考以 CLI 为准，skill 不内嵌命令表。
> 文中“规约”= 本项目 `llmanspec/specs/` 下的 `.feature` 文件；用 `llman-sdd list --specs` / `llman-sdd show <capability>` 查全文。

## Context
- 先查状态再动手：change/spec 状态以 `llman-sdd show/list/validate` 输出为准；读 spec 全文前先 `llman-sdd list --specs`，再直读 `.feature`。

## Goal
- 达成一个可验证结果；报告附结果路径与校验状态。

## Constraints
- 遵守正文硬约束与 `llmanspec/theorems/` 只读人类定理（不得由 Agent 擅自修改）。先判断规模选路径：合约变更走完整 SDD，实现层走 quick；不确定选完整 SDD。改动最小；已知校验错误不得强行继续。

## Workflow
- 每步以 `llman-sdd` 命令结果为事实来源；改动工件后必跑 `llman-sdd validate`；命令细节见 `llman-sdd <cmd> --help`。

## Decision Policy
- 高影响歧义先澄清再继续；事实自己查证，只有决策问用户。

## Output Contract
- 先给人读摘要（结论 / 风险 / 待决策），机器细节随后。

## Ethics Governance
- `ethics.risk_level`：low——只读写本仓库与 `llmanspec/`，无外发动作；正文另有声明时按正文执行。
- `ethics.prohibited_actions`：违反正文硬约束的动作；用户未明确要求时，不得 push、发 PR 或向外部上传。
- `ethics.required_evidence`：结论必须给出命令输出或文件路径；门禁状态以 `llman-sdd validate` 输出为准。
- `ethics.refusal_contract`：门禁 CRITICAL 未清零时，不得进入下一阶段；自修复达到上限时，报告 blocker。
- `ethics.escalation_policy`：改动 SDD 合约、模板，或执行不可逆动作前，必须先取得用户确认。
