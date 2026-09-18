---
depends_on: []
---

# 补齐 config 命令面(只读概览 + extra_skills 非交互管理)

## Why

双二进制对拍实证:v1 有 `config`(只读概览)与 `config skills`(extra_skills 管理,`--json`/`--no-interactive`),v2 完全缺失(`unknown command`)。extra_skills 目前只能手改 config.yaml,绕过了 schema 校验与注释保留机制(对齐差距清单-缺失命令,无移除定案,判定为遗漏)。v1 的交互式 MultiSelect 依赖交互栈;v2 交互走 PromptDriver(现阶段未接),故本 change 先落非交互管理面。

## What Changes

- 新增 `config`(无子命令):只读输出 config.yaml 概览(schema/locale/extra_skills enabled+total/bdd 开关/archive 五要素),不改任何文件。
- 新增 `config skills`:默认列出 enabled/available;`--json` 输出 {enabled, available}(available 为六枚举);`--set <name>`/`--unset <name>`(可重复)以注释保留方式增删 extra_skills 写回(保留 $schema 头行与用户注释);白名单外名字报错。
- 交互式管理不随本 change(等 PromptDriver/ink 阶段),在 design 记录。
- 新 capability `config-command`(config-command.feature),单测 + BDD 场景齐备。

## Capabilities

- `config-command`(新 capability:概览与 skills 管理合同,@req:r37、@req:r38)

## Impact

- `apps/cli/src/main.ts`(config 命令注册)+ `packages/core/src/config/`(概览渲染、注释保留写回复用既有 yaml parseDocument 机制);config schema 无新字段。
