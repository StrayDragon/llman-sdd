---
name: "llman-sdd-apply"
description: "提案已提交规格后使用。按 tasks 实现到门禁全绿。不用于还没绑定分支的变更。"
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Apply

一轮内按顺序完成 `llmanspec/changes/<id>/tasks.md` 全部任务：实现 → 补验证 → 跑门禁 → 失败自修复 → 全过后报告。遇明确 blocker 外不得中途问“是否继续”。

## Pipeline 位置

{{ unit("skills/git-native-flow") }}

> 进入前须 specs-landed 门通过（或 `needs_specs_change: false`）；`readyToImplement=true` 是本轮完成信号 → 下一步 `llman-sdd-verify`。

## 硬约束

- **不可变边界**：先遵守 `llmanspec/theorems/` 人类定理（只读，不得擅自修改）与 `llmanspec/AGENTS.md`，再逐条落实分支上的 `llmanspec/specs/**` 与 `proposal.md`/`design.md`/`tasks.md`。
- **范围与收尾**：改动最小，不顺手改无关文件，不留旧兼容层；不得在 apply 循环内跑 `change archive`（收口归 `llman-sdd-archive`）；因 blocker 中断前做一次 WIP commit 保全现场。
- **收口不是 task**：每完成一项立刻勾 `- [x]`；若 `tasks.md` 误列 `change archive` 须删去。
- **编辑与验证串行**：验证必须在编辑落盘后执行，不得把编辑与测试/校验放进同一批并行工具调用。

## 执行循环

1. **预检与读取**：读 `llmanspec/config.yaml`，用 `llman-sdd list --specs` 定位并直读 `.feature` 及 change 三工件；运行 `llman-sdd validate --all --strict` 排除无关脏状态。
{{ unit("skills/stage-guard") }}
2. **逐任务实现与验证阶梯**（按成本逐级扩大）：
   - **L1 单元** → **L2 定向行为** → **L3 显式全量**（`llman-sdd validate --check`，按 `specs.check_command` 跑真实 harness）→ **L4 收口兜底**（`change archive` 预合并强制 harness）。
   - **门禁证据红线**：缺省 `validate` 不跑 harness，声称 harness 合格必须经显式 `--check`（缺省结构门的通过不是通过）；harness 失败必须先查根因，不得绕过。前后对比类判据必须在 change 分支上测量（相对现算 merge-base）；重构类 task 必须对比改动前后测试用例数，用例数下降视为失败。
3. **失败自修复（上限 8 轮）**：先复现定位根因，最小修复后重跑失败命令再跑全门；超 8 轮未过则 STOP 输出 blocker 报告。
4. **人审关卡**：全部 task 完成且门禁全绿后跑 `llman-sdd validate <id> --strict` 与 `llman-sdd review`（有 CRITICAL 必须清零）；通过后输出人读摘要并宜接 `llman-sdd-verify`。

{{ unit("skills/cli-footer") }}

{{ unit("skills/version-drift") }}

{{ unit("skills/validation-hints") }}

{{ unit("skills/structured-protocol") }}
