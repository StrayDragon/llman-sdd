# 任务:start-worktree-per-root

## t1 合约:r68 追加子根 start --worktree 场景

- [ ] r68 规则块追加嵌套场景:子根实例上 `change start --worktree` 绑定写入新 worktree 的
      子根实例 proposal 且发起检出逐字节不变

## t2 实现:instanceDirRel 贯通 startChange

- [blocked-by: t1]
- [ ] core `startChange` opts 增 `instanceDirRel`(缺省 ''),worktree 分支 `ioAt` 重定向
      携带偏移;回滚错误消息改述实际探测路径(偏移空串时逐字节保持)
- [ ] `frontmatter.ts` 导出 `instanceDirRelOf`/`specsPrefixOfInstance` 双向原语,lifecycle
      私有反推函数删除改用之;`cli-shared` 增 `instanceDirRelFor(ctx)`,`specsPrefixFor`
      改由它组合;`change.ts` start 处理器传 `instanceDirRel`

## t3 测试:BDD 场景 + 差分

- [blocked-by: t2]
- [ ] t1 场景的 BDD steps 注册并转绿(夹具:双根 + 子根 change 文档 + 从子包目录
      `change start <id> --worktree`;断言绑定落 `<wt>/packages/tui/...` 且发起检出干净)
- [ ] stash 差分:回退 t2 源码后该场景必红;根实例既有 `--worktree` 场景全绿不受影响

## t4 门禁与文档

- [blocked-by: t3]
- [ ] `bunx tsc --noEmit`、oxfmt/oxlint 零错、unit/bdd/golden/integration 全绿、`just qa`
      EXIT=0;`validate start-worktree-per-root --check --strict` 通过;`validate --specs`
      全绿;`review` 0 CRITICAL
