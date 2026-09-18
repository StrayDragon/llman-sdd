---
depends_on: []
---

# init CLI 面兼容:目标路径位置参数与 --lang 别名

## Why

对拍差距清单:v1 `init [path]` 支持在任意目标目录初始化(v2 只能当前目录,传位置参数直接报 "too many arguments");v1 locale 选项为 `--lang`,v2 改名 `--locale` 且无别名,旧脚本/文档命令直接失效。方向已定:全量对齐(保留 `--locale`,`--lang` 以别名回归)。

## What Changes

- `init [path]`:位置参数指定目标目录(相对/绝对,不存在则创建),全部产物(llmanspec/、AGENTS.md、.agents/skills/)写入该目录;缺省当前目录(现状)。
- `--lang <locale>` 作为 `--locale` 的别名回归;两者同给 MUST 报错(消除歧义)。
- 产物内容、托管块、skills 治理逻辑零变化(纯 CLI 面)。
- 新规则 r49/r50;单测 + BDD 场景。

## Capabilities

- `init-generators`(@req:r49、@req:r50)

## Impact

- `apps/cli/src/main.ts`(init 命令签名)+ `packages/core/src/init/init.ts`(root 参数贯穿,现有 runInit 已按 root 工作,主要是 CLI 面透传)。
- golden 基线不受影响(渲染内容不变)。
