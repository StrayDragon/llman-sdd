---
depends_on:
  - align-stage-inference
branch: sdd/list-show-output-flags
base_branch: main
base_sha: 982e41895ad67f9ec70c4261e36521f5eef5d3b6
---

# list/show 输出面 flag 对齐与 show 文本合同

## Why

对拍差距清单:v1 `list --sort recent|name --compact-json`、`show -r/--requirement <N>`、`--output` 修饰值(compact/meta-only/no-scenarios)在 v2 缺失;`show <change>` 文本输出 v2 明确 pending(仅 --output json);v1 对 change 的 `## What Changes` 段有存在性门,v2 无。方向已定:全量对齐。`--output deltas/reqs-only` 随 checkpoint/delta 机制移除已定案,本 change 固化为"报错+指引"。

## What Changes

- `list --sort recent|name`(缺省 recent=mtime 降序)、`--compact-json`(须与 --json 同用,单行紧凑输出)。
- `show <change>` 文本输出(Stage/path/frontmatter/artifacts 摘要);`## What Changes` 存在性门(缺失报错,json 同样受门,对齐 v1 观测行为)。
- `show <spec> -r/--requirement <N>`(1-based 单 requirement 输出);`--output compact|meta-only|no-scenarios` 修饰文本输出;`--output deltas|reqs-only` 报错并提示已随 checkpoint/delta 移除。
- 新规则 r51-r53;单测 + BDD 场景。

## Capabilities

- `peripheral-commands`(@req:r51-r53)

## Impact

- `apps/cli/src/main.ts` + `packages/core/src/report/`;依赖 align-stage-inference(文本输出的 stage 展示须基于对齐后的单调规则)。
- `--output deltas/reqs-only` 从静默忽略变为报错,属 CLI 面破坏性变更,随 specs 声明。
