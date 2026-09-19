# Design: close-v1-parity-gaps

## 决策记录

1. **finalize 分支门加在 core**（finalizeChange）：v1 r94 在 relaxed gates 内检查
   current==binding.branch（git_native.rs:475-481）；v2 core 完全没有，CLI 层也只有
   validate sweep 门。加在 core 使直调与 CLI 同防；非默认分支由绑定语义保证
   （attach 拒绝默认分支），无需重复检查。绑定分支上的既有流程零影响。
2. **前缀解析扩面 = v1 命令集**：change start/attach/diff/finalize/archive 接入共享
   resolveChangeId（stderr 提示与错误语义与 show/validate 一致）。graph 已有自有
   resolveSeedId（exact > 活跃唯一前缀 > 归档唯一前缀，多命中/无命中报 GraphError），
   保留并写入 r61 合约——其归档兜底是 graph 特例（前次 change 已声明共享解析器不含
   归档兜底），不强行归一。
3. **context 懒刷新语义 = v1 r97**：missing/corrupted/stale 都先自动 rebuild 一次
   （零 LLM，pageindex），成功后正常检索；rebuild 失败输出
   `ok=false, errorKind=index_rebuild_failed` 的 JSON（沿用 unavailableResult），
   退出码 0（v1 同款「非零或 JSON error」二选一的后者）。stale 静默重建（v1 不出提示）。
   实现为 core 纯函数 `loadTreeWithAutoRebuild`（可单测），CLI 变薄壳。
4. **validateChange 完整性 WARNING**：
   - Full-not-ready：per-change，需 binding + git。ready 判定与 show.ts 完全同式
     （specsLanded = diff(baseBranch...branch) 含 llmanspec/specs/；ready = landed ∨
     ¬needs）。WARNING path=`proposal.md`，文案含 llman-sdd-propose 落 specs、
     不得重复 change start、apply 以 readyToImplement 为准三条引导。
   - 默认分支脏 specs：工作区级、每次 validate 调用至多一次，CLI 层 stderr 行
     （不改 JSON item 形状），条件 = current==default 且
     `git status --porcelain -- llmanspec/specs` 非空。
   - stage 推断升级为四态（binding 参与与 stageFor 同式），COMPLETENESS 补 full 键。
5. **孤儿验收 WARNING**：v1 文案 `orphan acceptance scenario '<name>' has no
   @req:<req_id> link`，path=`<cap>/acceptance/<name>`；加在 validate.ts 验收循环
   （reqIds 为空即报，与既有 dangling 检查互补）。
6. **r12 scope 措辞**：改为「--strict 下缺失判 ERROR、否则 WARNING」，实现对不动。

## 不处理（显式记录）

- v1 归档兜底解析/did-you-mean：维持不移植（前次 change Impact 已记录）。
- v1 r92 freeze --list 空档案退出码：v2 行为已一致（返回提示行、不报错），无需动作。
- v1 r135/r130 锁定哈希门禁：维持裁剪，合并后在 AGENTS.md 范围决策补记转正。
- AGENTS.md frontmatter SSOT 回填：合并后直提（内容按 v2 六字段实态改写，非照抄 v1）。
