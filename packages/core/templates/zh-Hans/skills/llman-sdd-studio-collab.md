---
name: "llman-sdd-studio-collab"
description: "消费 Studio 导出 Prompt、透明深链、处理评论修订层或做图规格体检时使用。不得静默覆盖 specs。不用于 Runtime Trace 漂移对账。"
metadata:
  version: "{{ llman_version }}"
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

{{ unit("skills/cli-footer") }}

{{ unit("skills/structured-protocol") }}
