---
depends_on: []
needs_specs_change: true
branch: sdd/add-worktree-hardening
base_branch: main
base_sha: 725f3c4eb66587b9b969f67eb50561c3c4cf613e
---

# worktree 加固:next-id 跨 worktree 扫描 + freeze 主检出警告

## Why

worktree 适配调研(worktree-aware-lifecycle 同日调研,F4/F5)遗留两项 P1:① `change next-id` 只扫当前 worktree 的 changes/——并行 worktree 各自建 change 时数字 id 会撞车(r35 扫描口径未覆盖关联 worktree);② `archive freeze` 在任意 worktree 可执行——陈旧 worktree 产出的冷备不完整、目录删除仅该 worktree 可见,无任何提示。本变更把两个 worktree 盲点补齐。

## What Changes

Specs landing:`llmanspec/specs/change-lifecycle.feature`(r35 扩展)与 `llmanspec/specs/review-freeze.feature`(r24 扩展)。

1. **r35 扩展(next-id 跨 worktree)**:`next-id` 的扫描范围 MUST 为当前工作树加全部关联 git worktree(`git worktree list --porcelain`,路径去重)各自的 `llmanspec/` 全树;human 输出格式不变(`max number in tree: N` + `next free number: M`);`--json` 的 warnings 在同一编号出现于多个 worktree 时 MUST 给出提示;worktree list 失败 SHALL 退化为仅当前树(best-effort,与归档扫描同级)。
2. **r24 扩展(freeze/thaw 主检出警告)**:执行 worktree 非默认分支持有 worktree(即非主检出)时,freeze/thaw MUST 输出 WARNING(指明当前为非主检出、冷备可能不完整、建议回主检出执行),不阻断既有行为;主检出判定 = 持有默认分支的 worktree。

## Capabilities

- change-lifecycle(r35 扩展)
- review-freeze(r24 扩展)

## Impact

- 行为增量均为「新增提示/扩大扫描」,既有输出形态与退出码不变;新 MUST 均配对 @executable(pending 保持 0)
- 无模板改动(freeze 警告为运行时输出,不涉 skills 引导文本)
