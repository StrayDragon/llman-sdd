---
name: "llman-sdd-studio-onboard"
description: "新项目首次接入 Studio 或接手陌生仓库需反向提炼业务图谱时使用。产出可解析的 .feature 表格规格并拉起 Studio。不用于常规需求提案。"
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Studio Onboard

把新项目或陌生仓库的关键业务可视化。整理出可被 Studio 解析与单步推演的首批 `llmanspec/specs/` 规格。

## 反向提炼流程

1. **划分领域边界**：读取目录结构、入口模块与数据模型。提炼 3–6 个职责清晰的业务能力（capability），避免塞进单一规格。
2. **按四类图谱落盘规格**：
   - **状态机**（生命周期明确）：在 `规则:` 下使用 `@transitions` 标注 `场景大纲:`，表格列头使用 `from | event | guard | to`（或中文列头）。
   - **流程图**（多分支步骤）：用步骤流转表表达主路径与条件分支，保证无不可达节点与死锁终态。
   - **决策真值表**（多条件组合判定）：用无 `@transitions` 的 `场景大纲:` 表格（至少两行数据）表达条件列与结果列。
   - **规则文档**（纯约束说明）：以 `@req:<id>` 挂 `规则:` 块，宜配嵌套 `场景:`。
3. **零告警基线自检**：
   - 运行 `llman-sdd validate --specs` 确认结构与 `@req:<id>` 合法。
   - 运行 `llman-sdd studio validate` 检查状态机与流程图 `E1–E4` / `F1–F4` 诊断，确保无阻断错误。
4. **打开全景工作台核对**：
   - 运行 `llman-sdd studio open` 打开当前工作区主视图；初次熟悉图谱交互时，可运行 `llman-sdd studio open --demo` 对照内置自举样例。
   - 多 Worktree 并行开发时，在不同 Worktree 目录分别运行 `llman-sdd studio open` 会自动复用本机单一 Hub 并按路径严格隔离工作区。

## 边界约束

- 不得 脱离真实代码编造不存在的状态转移或守卫条件。
- 不得 在默认分支未经人类确认直接覆盖已有 `llmanspec/specs/`；若仓内已有规格，宜先用 `llman-sdd change start <id>` 绑定特性分支。

{{ unit("skills/cli-footer") }}

{{ unit("skills/structured-protocol") }}
