---
depends_on: []
---

# 杂项 CLI 兼容:thaw --dest、backend 旗标、全局 --max-scan-depth

## Why

对拍差距清单收尾:v1 `archive thaw --dest <P>`(v2 缺,回置目标写死 changes/archive/);`context`/`index rebuild --backend pageindex`(v2 无旗标,且 v1 对 `--backend rag` 有"已移除+迁移指引"报错,v2 连接受面都没有);v1 sdd 全局 `--max-scan-depth <N>`(缺省 8,约束 changes/ 下 proposal.md 递归扫描深度,v2 无此全局旋钮)。

## What Changes

- `archive thaw --dest <path>`:回置目标改指定目录(不存在自动创建);缺省仍为 changes/archive/(现状保留)。
- `context` 与 `index rebuild` 接受 `--backend pageindex`(缺省与 env `LLMAN_SDD_INDEX_BACKEND` 兜底);`--backend rag` 报错并提示后端已移除。
- sdd 命令面全局 `--max-scan-depth <N>`(下限 1,缺省 8),对 list/show/validate --all/review/graph 等扫描 changes/ 的命令统一生效。
- 新规则 r56-r58;单测 + BDD 场景。

## Capabilities

- `review-freeze`(thaw --dest,@req:r56)
- `context-index`(backend 旗标,@req:r57)
- `peripheral-commands`(max-scan-depth,@req:r58)

## Impact

- core freeze.ts(可选 dest)、context 入口(backend 参数校验)、discovery(深度参数贯穿);CLI program 级全局选项。
