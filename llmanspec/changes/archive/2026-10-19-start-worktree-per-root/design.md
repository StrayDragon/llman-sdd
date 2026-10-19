# 设计:start-worktree-per-root

## 1. 修复形态(与 mergeRenameCommit 同型)

`startChange` worktree 分支现状:`ioAt(io, worktreePath)` → 根相对路径拼在 worktree
toplevel 下。修复:`ioAt(io, instanceDirRel === '' ? worktreePath : `${worktreePath}/${instanceDirRel}`)`,
与 finalize 重定向(specs-landed-per-root W1)完全同型。`mergeBase(gitAt(git, worktreePath), ...)`
为 git 级操作,不受影响。

## 2. 推导单一来源

双向原语收敛在 `packages/core/src/change/frontmatter.ts`(与 `DEFAULT_SPECS_PREFIX` 同处):
`instanceDirRelOf(specsPrefix)`(反推,'llmanspec/specs/' → '')与
`specsPrefixOfInstance(rel)`(正推,'' → 'llmanspec/specs/')。lifecycle 私有的
`instanceDirRelFrom` 删除改用导出原语(finalize/archive 两处调用点不变);
`cli-shared.specsPrefixFor` 改由 `instanceDirRelFor(ctx)` 组合,CLI start 处理器直接传
`instanceDirRelFor(rctx)`。

## 3. 错误消息

回滚错误消息现拼 `${worktreePath}/${path}`(无偏移);改述实际探测位置
`${redirected}/${path}`——子根场景下用户按消息能找到真路径,根场景文本退化不变
(偏移空串时 redirected === worktreePath,逐字节保持)。

## 4. 合约落点

r68 规则文本不改:其「binding MUST 写入新 worktree 内的 proposal.md」+ r118「读写目标
锚定命中实例根」联合蕴含子根读法;追加一个嵌套场景钉扎(子根 start --worktree → 绑定在
`<wt>/packages/tui/llmanspec/changes/<id>/proposal.md`,发起检出字节不变)。回滚面已有
通用场景覆盖,不重复。
