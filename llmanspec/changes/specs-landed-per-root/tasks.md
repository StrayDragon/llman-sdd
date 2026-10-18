# 任务:specs-landed-per-root

## t1 合约:specs-landed 判据新 req

- [ ] change-lifecycle 经 `spec next-req-id` 取号新增规则块,定义判据:按 change 被解析出的
      实例根取 `relative(git toplevel, 实例根)` 前缀,门判定 `diff --name-only base...branch`
      中该前缀下 `llmanspec/specs/` 命中;diff 范围现算 merge-base 不变;根实例退化为现行
      字面前缀;仿冒路径(`docs/llmanspec/specs/x`、`<rel>/docs/llmanspec/specs/x`)不计数;
      跨实例编辑只认本实例前缀
- [ ] 规则块带两个嵌套可执行场景:子根 change 编辑子根 specs → specs-landed 门绿;
      子根 change 只动根实例 specs → 门红

## t2 实现:specsLanded 实例前缀接线

- [blocked-by: t1]
- [ ] core `specsLanded` 增可选 `specsPrefix` 参数(缺省 `'llmanspec/specs/'`,单根零改动),
      单测覆盖:根前缀退化等价 / 子根前缀命中 / 仿冒路径不计数 / 只动他根 specs 不命中
- [ ] CLI 三调用点(lifecycle finalize 门、show gateChecks、changeCheck validate 门)以
      `relative(top, resolve(ctx.root))` 同源推导传入(与 harvestForRoot 同一组合)
- [ ] t1 两场景的 BDD steps 注册并转绿;既有 specsLanded 相关单测全绿

## t3 合约+覆盖:cli r109 补 archive freeze worktree 场景(债 4)

- [ ] r109 规则块追加嵌套场景:缺实例链接 worktree 内 `archive freeze --dry-run` 报域错误
      退出 1;显式 `--directory` 指向主检出可用且输出非主检出 WARNING
- [ ] 对应 BDD steps 注册并转绿(行为已实测正确,仅钉扎)

## t4 表面收敛:6 处内联 --directory 声明(债 1)

- [ ] config.ts:23、spec.ts:69/108/143/223、validate.ts:310 断链改经 `addSpecDirOption`
- [ ] r109 声明门单测全绿(--help 选项顺序变化已接受,见 design 5)

## t5 测试债三连清(债 3/5/6)

- [ ] 删 tests/bdd/steps/lifecycle.ts:1441 起的死代码重复注册(runner first-match 于 :970)
- [ ] removed-surface buildProgram 补 `registerSelf`,r109 豁免分支由死变活
- [ ] scope-boundaries r114 断言从 `.includes` 加强为顺序单调(先 namespace 后 value),
      stash 差分验证加强前旧断言确无序判别力

## t6 文档与全量验证

- [blocked-by: t2, t3]
- [ ] migrations 迁移 6 补收口门多根语义一句
- [ ] `bunx tsc --noEmit`、oxfmt/oxlint 零错、`bun test tests/unit` / `tests/bdd` /
      `tests/golden tests/integration` 全绿,`just qa` EXIT=0
- [ ] `validate specs-landed-per-root --check --strict --output human` 通过;`validate --specs`
      全绿;`review` 0 CRITICAL(基线在 change 分支相对 merge-base 测量)
