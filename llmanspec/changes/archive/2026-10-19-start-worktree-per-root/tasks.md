# 任务:start-worktree-per-root

## t1 合约:r68 追加子根 start --worktree 场景

- [x] r68 规则块追加嵌套场景:子根实例上 `change start --worktree` 绑定写入新 worktree 的
      子根实例 proposal 且发起检出逐字节不变

## t2 实现:instanceDirRel 贯通 startChange

- [blocked-by: t1]
- [x] core `startChange` opts 增 `instanceDirRel`(缺省 ''),worktree 分支 `ioAt` 重定向
      携带偏移;回滚错误消息改述实际探测路径(偏移空串时逐字节保持)
- [x] `frontmatter.ts` 导出 `instanceDirRelOf`/`specsPrefixOfInstance` 双向原语,lifecycle
      私有反推函数删除改用之;`cli-shared` 增 `instanceDirRelFor(ctx)`,`specsPrefixFor`
      改由它组合;`change.ts` start 处理器传 `instanceDirRel`

## t3 测试:BDD 场景 + 差分

- [blocked-by: t2]
- [x] t1 场景的 BDD steps 注册并转绿(夹具:双根 + 子根 change 文档 + 从子包目录
      `change start <id> --worktree`;断言绑定落 `<wt>/packages/tui/...` 且发起检出干净)
- [x] stash 差分:回退 t2 源码后该场景必红;根实例既有 `--worktree` 场景全绿不受影响

## t4 门禁与文档

- [blocked-by: t3]
- [x] `bunx tsc --noEmit`、oxfmt/oxlint 零错、unit/bdd/golden/integration 全绿、`just qa`
      EXIT=0;`validate start-worktree-per-root --check --strict` 通过;`validate --specs`
      全绿;`review` 0 CRITICAL

## t5 验证后修订(双轴评审 W-1/W-2/S-1 回修)

- [blocked-by: t4]
- [x] W-1:实现与合约文件补提交,clean-tree 门转绿、readyToImplement 亮起
- [x] W-2:`instanceDirRelOf` 正则改吃前导分隔符(`/\/?llmanspec\/specs\/$/`),
      `instanceDirRelOf(specsPrefixOfInstance(rel)) === rel` 精确成立('a/b/' 尾斜杠残留
      消除);canonical 输入行为不变(单测钉扎往返)
- [x] S-1:core index 超范围导出收敛——仅保留 apps 消费的 `specsPrefixOfInstance`
      (DEFAULT_SPECS_PREFIX/specsLanded/instanceDirRelOf 仍从模块导出,tests 走源路径)
- [x] S-2 记录(不修):相对 `sdd.worktree_root` 指向仓库内目录时,发起检出出现
      `?? <dir>/` untracked——r68 既有配置面,非本 change 引入,留待 config 文档统一提示
