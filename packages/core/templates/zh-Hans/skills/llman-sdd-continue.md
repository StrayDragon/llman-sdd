---
name: "llman-sdd-continue"
description: "继续已有 change：补建下一个缺失工件。"
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Continue

继续已有 change，创建下一个缺失工件。

## 步骤
1. 确定 change id：用户给了就用；否则跑 `llman-sdd list --json` 让用户选。始终说明「使用变更：<id>」。
2. 读 `llmanspec/changes/<id>/`。
> 阶段判定：用 `llman-sdd show <id> --output json --type change` 的 `stage` / `readyToImplement`；完整判定表见 llman-sdd-apply。
3. 按顺序确定下一个缺失工件：
   1) `proposal.md`
   2) `design.md`（仅有设计权衡时）
   3) `tasks.md`
   4) `llman-sdd change start <id>`（分支已存在用 `change attach <id>`）——绑定分支
   5) 在**绑定分支**编辑 `llmanspec/specs/<capability>.feature`（扁平，或目录主文件）并 commit——落地 specs（无合约变更设 `needs_specs_change: false`）
4. 只创建**一个**缺失工件（或一次绑定分支上的 spec 编辑）。
   - 不写应用代码；**不要**建 `changes/<id>/specs/`；**不要**在 start/attach 前改 `llmanspec/specs/**`。
5. 工件已齐全时，按 `llman-sdd show <id> --output json` 建议下一步：
   - specs-landed 门未过 → 先落地 specs（或 `needs_specs_change: false`）；**不要**建议 apply
   - specs-landed 门已绿（即使实施中期 `readyToImplement=false`、tasks 未完）→ `llman-sdd-apply`
   - verify 之后 → `llman-sdd-archive`
   - 校验：`llman-sdd validate <id> --strict`；审查：`llman-sdd change diff <id>`（只读）

{{ unit("skills/git-native-flow") }}
{{ unit("skills/cli-footer") }}
{{ unit("skills/validation-hints") }}

{{ unit("skills/structured-protocol") }}
