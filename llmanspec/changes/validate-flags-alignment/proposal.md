---
depends_on: []
---

# validate 命令面全量对齐(目标/模式/结构化输出/占位符)

## Why

对拍差距清单:v1 `validate [item] --all --changes --specs --type --strict --json --compact-json --stage <四档>` 在 v2 仅剩 `--specs`(no-op 标记)与 `--no-check`;`review` 的 critical 判定因此只能内联简化版 sweep。另有一处 v2 实现缺口:config `bdd.run_command` 的 `{feature_dir}/{feature_name}/{feature_path}` 占位符从未替换(恒 batch-once),pytest-bdd 类按目标逐项跑的框架无法接入。

## What Changes

- `validate [item]`:位置参数,change id 或 spec id 自动消歧;`--all`(全部 changes 与 specs);`--changes`/`--specs` 限定域;`--type change|spec` 强制消歧;`--stage draft|designed|planned|full` 按 v1 四档门判定 change;`--strict` 含 WARNING 即非零;`--json`/`--compact-json` 输出 ValidationReport(items[].id/type/valid/issues[].level/message)。
- 废除 `--specs` no-op 标记(并入 `--changes/--specs` 语义),help 与 specs 同步声明。
- bdd `run_command` 占位符替换:含 `{feature_dir}`/`{feature_name}`/`{feature_path}` 时按目标逐项替换执行;无占位符保持 batch-once(现状)。
- 新规则 r47/r48;单测 + BDD 场景。

## Capabilities

- `validation`(@req:r47、@req:r48)

## Impact

- `apps/cli/src/main.ts` + `packages/core/src/validation/`;review 的 sweep 内联实现后续可切换到本 change 的校验入口(不在本 change 范围)。
- `--specs` 移除属 CLI 面破坏性变更,随 specs 声明;现网脚本若用 `validate --specs` 需改为 `validate --specs`(新语义同域限定,命令兼容)。
