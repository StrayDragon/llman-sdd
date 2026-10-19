# 任务:specs-landed-per-root

## t1 合约:specs-landed 判据新 req

- [x] change-lifecycle 经 `spec next-req-id` 取号新增规则块,定义判据:按 change 被解析出的
      实例根取 `relative(git toplevel, 实例根)` 前缀,门判定 `diff --name-only base...branch`
      中该前缀下 `llmanspec/specs/` 命中;diff 范围现算 merge-base 不变;根实例退化为现行
      字面前缀;仿冒路径(`docs/llmanspec/specs/x`、`<rel>/docs/llmanspec/specs/x`)不计数;
      跨实例编辑只认本实例前缀
- [x] 规则块带两个嵌套可执行场景:子根 change 编辑子根 specs → specs-landed 门绿;
      子根 change 只动根实例 specs → 门红

## t2 实现:specsLanded 实例前缀接线

- [blocked-by: t1]
- [x] core `specsLanded` 增可选 `specsPrefix` 参数(缺省 `'llmanspec/specs/'`,单根零改动),
      单测覆盖:根前缀退化等价 / 子根前缀命中 / 仿冒路径不计数 / 只动他根 specs 不命中
- [x] CLI 三调用点(lifecycle finalize 门、show gateChecks、changeCheck validate 门)以
      `relative(top, resolve(ctx.root))` 同源推导传入(与 harvestForRoot 同一组合)
- [x] t1 两场景的 BDD steps 注册并转绿;既有 specsLanded 相关单测全绿

## t3 合约+覆盖:cli r109 补 archive freeze worktree 场景(债 4)

- [x] r109 规则块追加嵌套场景:缺实例链接 worktree 内 `archive freeze --dry-run` 报域错误
      退出 1;显式 `--directory` 指向主检出可用且输出非主检出 WARNING
- [x] 对应 BDD steps 注册并转绿(行为已实测正确,仅钉扎)

## t4 表面收敛:6 处内联 --directory 声明(债 1)

- [x] config.ts:23、spec.ts:69/108/143/223、validate.ts:310 断链改经 `addSpecDirOption`
- [x] r109 声明门单测全绿(--help 选项顺序变化已接受,见 design 5)

## t5 测试债三连清(债 3/5/6)

- [x] 删 tests/bdd/steps/lifecycle.ts:1441 起的死代码重复注册(runner first-match 于 :970)
- [x] removed-surface buildProgram 补 `registerSelf`,r109 豁免分支由死变活
- [x] scope-boundaries r114 断言从 `.includes` 加强为顺序单调(先 namespace 后 value),
      stash 差分验证加强前旧断言确无序判别力

## t6 文档与全量验证

- [blocked-by: t2, t3]
- [x] migrations 迁移 6 补收口门多根语义一句
- [x] `bunx tsc --noEmit`、oxfmt/oxlint 零错、`bun test tests/unit` / `tests/bdd` /
      `tests/golden tests/integration` 全绿,`just qa` EXIT=0
- [x] `validate specs-landed-per-root --check --strict --output human` 通过;`validate --specs`
      全绿;`review` 0 CRITICAL(基线在 change 分支相对 merge-base 测量)

## t7 验证后修订(双轴评审 C1/W1/S1 回修)

- [blocked-by: t6]
- [x] C1:r119 括号与 proposal Impact 改口——判定语义与 validate/finalize 的消息文本在单根/根实例
      逐字节不变;show 红态 hint 统一含实例前缀(根实例为字面量 `llmanspec/specs/`),属随统一
      模板有意改进的单处文本面
- [x] W1:`mergeRenameCommit` 增 `instanceDirRel`(由 specsPrefix 反推,与 CLI `specsPrefixFor`
      同源互逆),`ioAt` 重定向携带实例偏移;finalize/archive 两路接线;r118 补「子根 change 在
      持有其分支的链接 worktree 内 finalize 归档成功」场景(stash 回退 lifecycle 后必红,
      修前该路径 merge 已执行而 rename ENOENT)
- [x] S1:缺省前缀字面量收敛为导出常量 `DEFAULT_SPECS_PREFIX`(specsLanded 缺省 +
      closeOutGate/showChangeJson/validateChange 四处 `??` 共用)
- [x] 记债(探针实证):`change start --worktree` 在子根实例上因同一 `ioAt` 偏移报
      「proposal not found in the new worktree: <wt>/llmanspec/...」——回滚护栏生效(分支删除、
      零部分写入),预存接缝;修复需向 `startChange` 传实例偏移并补 r68/r69 场景,另立 change 处理
