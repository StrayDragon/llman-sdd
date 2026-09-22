---
depends_on: []
needs_specs_change: false
branch: sdd/fix-show-dirstyle-specs
base_branch: main
base_sha: 57320af30421566a3c4a0ebb480e7dac9720ffdc
---

# 修复 show 对目录式 specs 的解析缺陷

## Why

`show <capability>` 只按扁平 `llmanspec/specs/<item>.feature` 做存在性判断（`apps/cli/src/main.ts` show action），目录式布局 `llmanspec/specs/<cap>/<cap>.feature` 落空后走 change 分支，误报 `change not found: <cap>`；`--type spec` 强制时同样失败（路径解析仍按扁平拼路径）。三仓库调研实测：xylitol 与 crystalith（目录式 specs）全部 show 失败，而同仓库的 validate/list/collectSpecs 均能列出同一批 specs——解析口径在同一 CLI 内分裂。目录式布局是 propose 流程文档明确支持的形态。

## What Changes

- `show` action 的 spec 判定追加 `discoverSpecs` entries 精确匹配（id 口径 = `capability ?? fileName`，与 `renderSpecJson`/`collectSpecs` 一致）；保留既有扁平 `existsSync` 子句，扁平仓库行为字节级不变
- spec 源文件路径解析：扁平存在 → 扁平路径；否则用 entry 的相对 `fileName` 拼路径；两者皆无 → 维持 `spec not found: <item>` exit 1
- integration 测试：临时仓库 spawn CLI，覆盖目录式 show 文本/JSON、不存在项报错、扁平仓库回归

## Capabilities

- peripheral-commands（实现层缺陷修复，不改变任何 MUST/SHALL 文字——specs 未钉 specs 目录布局，r25 的 spec id 精确匹配优先语义不变）

## Impact

- 代码：`apps/cli/src/main.ts`（show action 判定与路径）；`tests/integration/`（新增用例）
- 不兼容变更：无；`--type change` + spec id 的既有覆盖 quirk 在扁平/目录式之间均一化（两者现在行为一致）
- 已知残留（不在本变更）：`spec add-req`/`add-scenario` 的 authoring helpers 仍有扁平路径假设，另行处理
