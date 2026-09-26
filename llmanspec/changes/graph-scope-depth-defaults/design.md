# graph-scope-depth-defaults 设计

> 前置：用户已拍板——全图模式 `--depth`（默认 1 层、0 = 仅 scope 节点、2+ 递归）；
> 种子模式语义不变。show 对冻结卡不改（现状已够）。

## 1. 目标语义

| 模式 | `--depth` 语义 | 缺省 |
|---|---|---|
| 种子（`graph <seed>`） | 依赖+反向 BFS 展开层级（现状，不变） | 1 |
| **无种子全图**（`--scope ...` 无位置参数） | scope 内节点为根，依赖链展开 N 层 | **1**（修订：现状忽略 depth） |

### 无种子 depth 具体含义

- `--depth 0`：仅输出 scope 内节点（不拉入任何依赖 target）。
- `--depth 1`（缺省）：scope 内节点 + 每个 present 节点的直接依赖 target（与现状
  `buildDefaultNodes` 的「缺失依赖拉取」等价，但显式化）。
- `--depth N (≥2)`：以 scope 内节点为根，沿 `depends_on` 递归展开 N 层；深度超限的依赖
  不纳入节点集。
- 拉入的依赖 target 若不在 scope，作为节点保留（含 present/archived 标记），供边展示。

## 2. 现状核实（真实环境测量）

- `--scope archived`：52 节点 / 26 边（50 卡 + 2 个被引用非卡 id）。
- `--scope all`：53 节点。
- 传 `--depth 0/1/5` 输出不变 → `--depth` 被静默忽略（语义漏洞）。

## 3. 实现路径

- `analysis.ts`：
  - `buildDefaultNodes(io, root, kinds, depth, maxScanDepth)` 增加 `depth` 参数。
  - `--depth 0`：`collectNodes` 结果直接返回（不拉缺失依赖）。
  - `--depth 1`：现状逻辑（scope 节点 + 一层缺失依赖）。
  - `--depth ≥2`：BFS 从 scope 节点展开 `depth` 层，节点集 = scope + 可达依赖（每层
    逐个加入）。复用 `buildMaps` 的依赖映射。
- `graphData.ts` / `render.ts`：无种子分支透传 `opts.depth ?? 1`。
- CLI `apps/cli/src/commands/graph.ts`：确认 `--depth` 声明与解析；无种子时不再忽略。

## 4. 边界与风险

- `--depth` 解析：CLI 可能将 `--depth <N>` 仅绑定种子定义；需确认无种子路径也能读。
- 缺省行为变化：`--scope archived/all` 无 depth 时从「全量」变「一层」——符合用户意图，
  但 help 与模板文案需同步（避免旧用户困惑）。
- `--scope active` 缺省：只显示 active + 直接依赖；需在文档注明「全 active 用
  `--depth 0`」。
- 测试：新增 default/0/2+ 三档节点集断言 + `--depth` 不再被忽略的回归。

## 5. 不做的事

- 不改种子模式 depth 语义（缺省 1、BFS 双向）。
- 不改 `--specs`/`--format` 等其它 graph 面。
- 不加新旗标（复用既有 `--depth`）。
