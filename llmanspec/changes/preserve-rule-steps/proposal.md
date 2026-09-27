---
depends_on: []
---

# 迁移保留规则场景自身的验收步骤

## Why

issue #2:`spec migrate-native` 对 0.4 时代「顶层 `场景:` 内同时含描述 bullets 与 假如/当/那么 步骤」的 legacy 文件,把该场景归类为规则场景后只输出描述行——其自身 steps 在任何渲染分支都没有消费路径,被静默丢弃且无告警(dry-run 与退出码均显示成功)。真实仓库实测(107 feature / 827 规则块)净丢约 3090 行验收步骤,事后 `validate --specs --strict` 依旧全绿,结构上不可检测。

`analyzeLegacy()` 已解析出 steps(`sc.steps`),数据齐全,只是 `migrateNativeSource()` 渲染规则块时不消费它。这与 migrations/v0.4-v0.5/README.md 的承诺(nests acceptance scenarios under `@req`)不符。

## What Changes

- `migrateNativeSource()` 渲染规则块时,若该 legacy 规则场景自身带 steps,将其合成为该规则块内的一个自动嵌套 `场景: 验收示例`——位置紧跟描述行之后、既有归属验收之前,步骤关键字与文本原样保留,不再丢弃。
- legacy 规则场景带 `@skip` 时,其自动嵌套场景继承 `@skip`(保留「该验收不参与执行」的原始意图)。
- 自动嵌套场景计入返回值 `scenarios`,`[migrate]` 摘要行计数如实反映。
- 不改 CLI 命令面;不改既有 zh-CN 关键字输出;源方言与关键字一致性(issue #3)由独立 change 处理。

## Capabilities

- `specs/spec-parsing`:新增规则 r65(迁移保留规则场景自身步骤),含可执行场景。

## Impact

- `packages/core/src/spec/migrateNative.ts`:规则块渲染分支消费 steps。
- `tests/unit/spec.test.ts`:同体形态 roundtrip 单测(输入取 issue #2 MVP)。
- `tests/bdd/steps/parse.ts` + `llmanspec/specs/spec-parsing.feature`:r65 可执行场景与步骤绑定。
- 下游注意:0.5.0 已迁移过的仓库,丢失步骤无法由工具恢复(迁移工具对 native 文件 skip),需从 legacy 原件重跑;本修复保证此后迁移不再丢失。
