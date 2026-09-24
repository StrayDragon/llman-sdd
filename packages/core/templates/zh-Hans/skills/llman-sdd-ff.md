---
name: "llman-sdd-ff"
description: "一趟走完 propose 等价路径：规划文档 → 绑定分支 → 落地 specs。"
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Fast-Forward (FF)

快速走完 propose 等价路径：规划文档 → 绑定分支 → 落地 specs（至 specs-landed 门通过）。**不是**旧的 `changes/<id>/specs/` delta 模型。

## 硬约束

- 规划文档只写在 `llmanspec/changes/<id>/`（proposal/design/tasks）；specs 只写在绑定分支的 `llmanspec/specs/**`。
- **禁止**创建 `llmanspec/changes/<id>/specs/`。
- `stage=full` 且 specs-landed 门通过（或 `needs_specs_change: false`）即可进 apply；verify/finalize 须 `readyToImplement=true`。

## 步骤

1. 取得一句话描述；change id 未给则推导并宣布（非阻塞，同 propose 规则）；确定受影响 capability。
2. 确保已 `llman-sdd init`（存在 `llmanspec/`）。
3. `llmanspec/changes/<id>/` 已存在：询问补齐或换 id；勿未确认就覆盖。
4. 建规划文档（可短暂在默认分支）：`llman-sdd change new <id>`（或手写）→ 充实 `proposal.md` → `design.md`（按需）→ `tasks.md`。
5. **绑定分支**：`llman-sdd change start <id>`（干净树 + 默认分支）或手动建分支后 `change attach <id>`。
6. **落地 specs**：在绑定分支编辑 `llmanspec/specs/<capability>.feature`（扁平，或目录主文件）并 commit；无合约变更设 `needs_specs_change: false`。
7. 校验：`llman-sdd validate <id> --strict`。
8. 用 `llman-sdd show <id> --output json` 确认 specs-landed 门绿（`specsLanded`/`needsSpecsChange`）后建议 `llman-sdd-apply`（未落地前不要建议）。

{{ unit("skills/git-native-flow-brief") }}
{{ unit("skills/cli-footer") }}
{{ unit("skills/validation-hints") }}

{{ unit("skills/ethics-governance") }}
