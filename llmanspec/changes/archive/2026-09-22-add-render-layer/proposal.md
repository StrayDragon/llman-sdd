---
depends_on:
  - fix-show-dirstyle-specs
needs_specs_change: false
branch: sdd/add-render-layer
base_branch: main
base_sha: 91a90f471090a1eae57c7e54f05025eb9557a135
---

# 渲染层地基:统一机器格式出口(IR + json/compact-json/toon 渲染器)

## Why

报告型命令的 text 与 JSON 输出是各自手写的两条路径(validate 的 renderValidateText/Json、list 的 renderChangesList/Json、show 的内联双分支、review 的 lines 数组与内联 JSON.stringify)。TOON 缺省化(C3)若直接贴在现有 json 分支上,会把三套写法漂移固化。本变更是 C3 的前置地基:每命令一份 canonical IR,机器格式(json/compact-json/toon)由单一核心渲染器产出,human 保持既有实现——后续任何格式扩展只改渲染器一处。

## What Changes

- core 新增 `src/render/machine.ts`:`renderMachine(ir, 'json'|'compact-json'|'toon')`,toon 经官方 `@toon-format/toon` v4.1.1 编码(新增运行时依赖,技术栈节同步登记)
- 五个报告型命令接入(行为不变的重构):review({signals,summary})、validate(items 结构)、list(changes/specs 两数组)、show(renderSpecJson 既有对象)、config skills({enabled,available});`--json` pretty 输出字节级不变
- 非缺省的 compact 归一化:原 list/show 的「pretty 去换行」与 show 的「indent 0」统一为真紧凑 `JSON.stringify(ir)`(数据不变,仅空白差异,合约「单行紧凑 JSON」仍满足)
- toon 格式在本变更**不接任何 flag**,仅以单测固化(round-trip、中文 capability/含逗号引号 detail fixture);flag 面与缺省翻转归 C3

## Capabilities

- review-freeze / validation / peripheral-commands / config-command(均为实现层重构,不改变任何 MUST/SHALL 可观测行为;`--json` 结构合约不动)

## Impact

- 代码:`packages/core/src/render/`(新)、`packages/core/src/report/collect.ts`、`specs.ts`、`packages/apps/cli/src/main.ts`(五命令 json 分支)、`packages/core/package.json`(依赖)
- 测试:core 单测(渲染器四格式 + round-trip);三仓库字节基线比对(/tmp/c1baseline)作为零漂移验收
- 不兼容变更:无(缺省输出零改动;compact-json 空白归一化不触合约)
