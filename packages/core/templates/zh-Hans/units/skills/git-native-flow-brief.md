## Git-native 生命周期（摘要）

勿混淆：**Skill 导航** ≠ **Git-native 生命周期**。全图见根 `AGENTS.md`「领域概念区分」或 `llman-sdd-propose` 内嵌全图。

硬规则：
1. **先** Branch binding（`change start` / `attach`）→ Full；**再** Specs landing（绑定分支编辑并 commit `llmanspec/specs/**`）。
2. 无 live 合约变更 → `needs_specs_change: false`。`stage=full` 且 specs-landed 门通过即可进入 apply；`readyToImplement=true`（全门绿）是 verify/finalize 前的完成信号。
3. 收口用 `change finalize`（自动提交 `archive(sdd): <id>`；`--no-commit` 可跳过）。
4. **禁止**在默认分支 commit live specs；已 attach 勿重复 `start`。
5. worktree 模式（可选）：`change start --worktree` 在独立 worktree 建分支且不劫持当前检出（`--base <branch>` 记录非默认分叉源）；finalize 目标被其他 worktree 持有时自动原地执行（输出标注位置）。
