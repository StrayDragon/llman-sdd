---
depends_on: []
title: 子根实例上 start --worktree 的绑定落点携带实例偏移
---

## Why

`specs-landed-per-root` 归档时记债(探针实证):`change start --worktree` 在子根实例上运行
时,`startChange` 的 `ioAt(io, worktreePath)` 以新 worktree 的 git toplevel 直接拼接根相对
路径,丢失 `packages/tui` 实例偏移——绑定探测与写入落到 `<worktree>/llmanspec/` (仓库根
实例)而非 `<worktree>/packages/tui/llmanspec/`,报
`proposal not found in the new worktree: <wt>/llmanspec/...` 后回滚(护栏生效,零部分写入)。
r68 条款「binding MUST 写入新 worktree 内的 proposal.md」在多根模型下的自然读法是**同一
实例**的 proposal;且 AGENTS.md worktrunk 规约的标准流程(一个 change 分支 = 一个 worktree)
对子根 change 因此不可用。与 `specs-landed-per-root` 已修的 finalize 重定向
(`mergeRenameCommit` 的 `instanceDirRel`)同病同源,属最后一条已知的 `ioAt` 偏移接缝。

## What Changes

- **合约(r68 追加场景,不改规则文本)**:子根实例上 `change start --worktree` 绑定写入新
  worktree 的**子根实例** proposal,发起检出逐字节不变;r118「落盘与读写目标随之锚定
  命中实例根」与 r68 联合已蕴含该语义,场景补齐可执行钉扎。
- **core**:`startChange` opts 增 `instanceDirRel`(缺省 `''`,根实例零改动);worktree 分支
  的 `ioAt` 重定向携带偏移;proposal-缺失回滚错误消息改述实际探测路径(含实例偏移)。
- **推导统一**:`frontmatter.ts` 导出 `instanceDirRelOf(specsPrefix)`(specs-landed-per-root
  引入的 lifecycle 私有反推函数上移共用)与 `specsPrefixOfInstance(rel)` 双向原语;
  `cli-shared.ts` 增 `instanceDirRelFor(ctx)`(git toplevel + 解析根,与 `specsPrefixFor`
  同源),`specsPrefixFor` 改由它组合;`change.ts` start 处理器传 `instanceDirRel`。
- **测试**:BDD 场景(steps 入 `tests/bdd/steps/scope-boundaries.ts`,多根夹具复用);
  stash 差分证明修前必红。

## Capabilities

- `change-lifecycle`(r68 场景追加)

## Impact

- 行为变化仅子根实例的 `--worktree` 路径:从必败回滚转为正确落绑定;根实例与经典路径
  逐字节不变(偏移缺省空串,ioAt 等价)。无破坏面(原路径本就无法成功)。
- 清偿 `specs-landed-per-root` t7 记录的最后一笔实证债;`ioAt` 两处调用点自此全部携带
  实例语义,多根模型收口链路(发现→读写面→观测→收口→分支创建)闭合。
