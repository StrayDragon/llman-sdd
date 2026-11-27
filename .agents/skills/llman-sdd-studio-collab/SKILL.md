---
name: "llman-sdd-studio-collab"
description: "消费 Studio 导出 Prompt、透明深链、处理评论修订层或做图规格体检时使用。不得静默覆盖 specs。不用于 Runtime Trace 漂移对账。"
metadata:
  version: "0.11.0"
---

# LLMAN SDD Studio Collab

规范编码 Agent 与 Studio 可视化工作台的异步协商、意图不可达回执及图规格体检流程。全流程优先使用本机确定性 CLI，零 MCP 配置门槛。

## 消费 Studio 导出 Prompt 与深链

1. **读取精确上下文**：先解析 Prompt 中的 `[定位: <图> · 对象(uid)]` 锚点与子树净 Diff，或直接运行 `llman-sdd studio diff <state-id>` 查看结构化语义差异与未解决评论。
2. **图规格体检**：运行 `llman-sdd studio validate <state-id>` 核对状态机 `E1–E4`、流程图 `F1–F4` 诊断与孤立节点，结合主视图跨分组依赖（交叉桥）评估变更影响面。
3. **三类协商回写动作**：
   - **回复讨论或回传不可达/冲突回执**：当人类画布意图与代码约束冲突或在技术上不可达时，必须 通过 `llman-sdd studio comment reply <state-id> <comment-id> --body "<根因与备选方案>"` 结构化回写结论，不得 强行妥协实现。
   - **推送非破坏修订层**：需要提出具体改图方案时，运行 `llman-sdd studio revise <state-id>` 追加虚线修订提案，交由人类在 Studio 世界线中审阅采纳。
   - **预览并按写保护出口落盘**：任意分支均可先运行 `llman-sdd studio apply <state-id> --dry-run` 预览 Unified Diff。

## 分支写保护三出口

默认分支（如 `main` / `master`）不得直接改写 `llmanspec/specs/`。人类确认意图后按以下三出口之一推进：

1. 切换到已绑定的可写特性分支或 Worktree 后运行 `llman-sdd studio apply <state-id>`。
2. 先运行 `llman-sdd change start <id>` 新建特性分支，再执行语义写回并补齐验证。
3. 仅导出 `proposal.md` 草案交由人类统筹排期，不直接触碰规格文件。

## 协作红线

- 必须 以 `llman-sdd studio diff`、`llman-sdd studio validate` 与真实 `.feature` 源码为事实来源。
- 不得 未经人类确认静默覆盖 `llmanspec/specs/`，也不得 绕过默认分支写保护护栏。

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
