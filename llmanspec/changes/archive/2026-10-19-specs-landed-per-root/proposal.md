---
depends_on: []
title: 多根模型下收口门按 change 所属实例根判定 specs 落地
branch: sdd/specs-landed-per-root
base_branch: main
base_sha: bbe6a312dc889e3fece9cee006a53e4fe826ed0b
---

## Why

`subproject-namespace-scope` 归档后的中立复查确认六笔记债,深挖后发现最重的一笔(原记
`specsLanded` 根字面前缀)实为**合约空白**:`packages/core/src/change/frontmatter.ts` 的
`specsLanded` 以字面量 `startsWith('llmanspec/specs/')` 判定规格落地,但合约中(r45 只引用
`specsLanded || !needsSpecsChange`,r73 是依赖解析)从未定义 landed 判据——多根时代子根
change 编辑 `packages/tui/llmanspec/specs/**` 会被 `change finalize` 误拦
("close-out blocked"),只能靠 `needs_specs_change: false` 绕行,与「解析出的实例根决定
该命令的全部读写目标」(scope-boundaries r115)矛盾。其余五笔为同批核实的行为覆盖盲区与
表面/测试债。

## What Changes

- **合约新增(change-lifecycle 新 req)**:定义 specs-landed 判据——按 change 被解析出的
  实例根取 `relative(git toplevel, 实例根)` 前缀,门判定 `diff --name-only base...branch`
  中该前缀下 `llmanspec/specs/` 的命中;diff 范围算法不变(现算 merge-base);根实例退化为
  现行字面前缀(单根行为逐字节不变);`docs/llmanspec/specs/x` 类仿冒路径仍不计数;跨实例
  编辑只认本实例前缀(严格本实例,与 r116 写面约束同精神)。带嵌套可执行场景(子根 specs
  落地门绿 / 只动他根 specs 门红)。
- **实现接线**:`specsLanded` 增实例前缀入参,core 三调用点(lifecycle finalize 门 /
  show gateChecks / changeCheck validate 门)由 CLI 以 `harvestForRoot` 同源推导
  (`relative(top, resolve(ctx.root))`,r118 已锚定 git toplevel)传入。
- **cli r109 补场景(债 4)**:`archive freeze --dry-run` 在缺实例 worktree 的域错误 +
  显式 `--directory` 重定向可用(行为已正确,仅缺合约钉扎)。
- **表面收敛(债 1)**:config/spec×4/validate 共 6 处链式内联 `--directory` 声明收敛到
  `addSpecDirOption`;接受 `--help` 选项展示顺序随声明序变化(无测试钉死 help 序)。
- **测试债三连清(债 3/5/6)**:删 lifecycle.ts 重复注册的死代码步骤;removed-surface 的
  buildProgram 补 `registerSelf` 使 r109 豁免分支变活;r114 撞号观测断言从成员关系加强为
  顺序单调(namespace 后 value)。
- **文档**:migrations 迁移 6 补收口门多根语义一句(子根 change 编辑子根 specs 即可过门,
  不再需要 needs_specs_change: false 绕行)。

## Capabilities

- `change-lifecycle`(新 req:specs-landed 判据,经 next-req-id 取号)
- `cli`(r109 追加场景,不改规则文本主体)

## Impact

- 行为变化仅多根场景:子根 change 收口门从误拦转为按实例前缀正确判定;单根/根实例的判定语义与
  validate/finalize 消息逐字节不变(前缀退化为现行字面量);show 红态 hint 统一含实例前缀(根实例为字面量),
  属随统一模板有意改进的单处文本面变化。无破坏面迁移需求(v0.10 未发布,迁移 6 为在册文档,
  原地补述)。
- 六笔记债全数清偿;已核实的事实依据与探针记录见 tasks 各条。
