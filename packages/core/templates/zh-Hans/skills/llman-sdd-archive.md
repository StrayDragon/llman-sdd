---
name: "llman-sdd-archive"
description: "verify 通过后使用。把已完成 change 合并回基准分支并归档。不用于仍在实施的变更。"
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD 归档

将 verify 全绿的绑定 change 收口回基准分支并归档至 `llmanspec/changes/archive/`。

> 位于分支生命周期最后一站。specs 膨胀时可跑 `llman-sdd-specs-compact`。

## 硬约束

- **前置门禁**：必须先 verify 全绿、已绑定分支、工作区干净，且每个 id 均通过 `llman-sdd review`（无 CRITICAL）与 `llman-sdd validate <id> --strict`。
- **单命令本地收口**：`llman-sdd change archive <id>` 自动完成预合并门禁、合并（默认 squash）、目录改名与自动提交 `archive(sdd): <id>`（`--no-commit` 跳过自动提交）。不得默认 `git push` 或建 PR。
- **批量连续执行**：批量归档一口气跑完，任一失败即停并报告剩余 ID；不得中途问“是否继续”。

## 步骤

1. **确认目标与干净树**：检查 `git status --porcelain`，明确归档 ID 列表（可查 `llman-sdd list --json`）；破坏性合约变更须确认 `migrations/v<from>-v<to>/` 已就绪。
2. **逐个校验并归档**：
   - 运行 `llman-sdd review`（无旗标）与 `llman-sdd validate <id> --strict`；任一失败即停。
   - 可先 `--dry-run` 预览，再运行 `llman-sdd change archive <id>`。目标分支被其他 worktree 持有时自动在该 worktree 原地收口。
3. **收尾复核**：全部归档后运行 `llman-sdd validate --all --strict`；squash 合并后可按需 `git branch -D <feature>`。归档目录过多时可用 `llman-sdd freeze` / `llman-sdd thaw` 维护冷备索引卡。

{{ unit("skills/cli-footer") }}

{{ unit("skills/validation-hints") }}

{{ unit("skills/structured-protocol") }}
