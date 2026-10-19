# 设计:specs-landed-per-root

## 1. 判据语义(决策已锁定)

**判定源 = 解析实例根同源**:finalize/show/validate 流程中 change 已从某实例根的
`llmanspec/changes/` 解析出来,收口门即用同一根推导 specs 前缀:

```
specsPrefix = relative(gitToplevel, resolve(instanceRoot)) →
  ''        → 'llmanspec/specs/'          (根实例,退化现行字面量)
  'packages/tui' → 'packages/tui/llmanspec/specs/'    (子根实例)
```

与 `harvestForRoot`(change.ts:162-163,r118 锚定 git toplevel)同一推导,不新增第二套
路径逻辑。被否决的备选:diff 中 change 目录位置自推导(纯 specs 分支无锚点,需回退分支);
任一实例前缀命中即算(宽粒度,子根 change 误动根 specs 也能过门,破坏多根隔离)。

**严格本实例**:子根 change 分支只动根实例 specs → 门仍红(须落本实例 specs 或显式
`needs_specs_change: false`),与 r116 写面默认限本实例同精神。

## 2. 合约落点(决策已锁定)

change-lifecycle **新 req**(next-req-id 取号)独立定义判据,r45 的
`specsLanded || !needsSpecsChange` 引用不动。理由:r45 已是取值序复合条款,判据是独立
可执行语义,应有自己的 @req 句柄与嵌套场景。场景两向:

- 子根 change 编辑子根 specs → `show` 的 specs-landed 门绿(finalize 同判据);
- 子根 change 只动根实例 specs → 门红(严格本实例)。

## 3. 实现接线

core:`specsLanded(git, binding, specsPrefix = 'llmanspec/specs/')` 增可选前缀参数
(缺省根字面量——单根调用零改动);三调用点 lifecycle.ts:350 / report/show.ts:67 /
validation/changeCheck.ts:393 由 CLI 传入。CLI 侧在 reRootContext 之后、门判定之前推导
前缀(复用 r118 的 toplevel+relative 组合),不引入新 IO。

## 4. 债 4 场景归属

挂 **cli r109**(域错误族):现有场景覆盖 `list`,补 `archive freeze --dry-run` 在缺实例
链接 worktree 的域错误 + 显式 `--directory` 重定向(带非主检出 WARNING)。行为已实测正确,
场景仅钉扎。

## 5. 已接受的次级影响

- 债 1 收敛后 `--help` 选项展示顺序随声明序变化(commander 按声明序渲染);已核实无测试
  钉死 help 序,completion 生成亦不依赖顺序。
- 债 3 删除的是 runner 顺序匹配下永不命中的第二注册(first-match 于 lifecycle.ts:970),
  零行为影响。
