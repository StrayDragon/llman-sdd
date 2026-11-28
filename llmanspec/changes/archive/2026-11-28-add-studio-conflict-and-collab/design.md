# Design: 图上对比差异并把选中更新合并进当前图表

本设计锁定 `add-studio-conflict-and-collab`：在 **现有图表** 上展示「你在本画布的调整」与「文件里新来的」差异，让使用者勾选要合并进当前图的条目；冲突出现时自动在世界线留一格可退版本。生产界面面向产品/老板等非技术人员，**禁止** `BASE` / `LOCAL` / `REMOTE` / `baseHash` / `409` / `SSE` 等术语。领域算法与测试仍可用内部三字母称呼。

遵守人类定理：`core-zero-io`（三方判定与合并纯函数，时钟经参数注入）、`studio-production-hygiene`（白话文案、不得静默写 `llmanspec/specs/`）、`cli-dual-runtime`（CLI 适配层零 `Bun.*`）。

已定决策见提案 Open Questions。下文不再复述待定项。

---

## D1 纯域三方条目（`packages/core/src/studio/sync.ts`）

复用 `computeMachineDiff` 的语义签名（状态名、转移 `(from, event, guard, to)`），**不**对 `.feature` 文本做行级三方合并。

内部把磁盘打开时的 IR 叫 `base`、画布草稿叫 `ours`、现在磁盘重解析的 IR 叫 `theirs`。对每个状态机（及 `docDrafts` 按规则块）产出 `SyncItem[]`：

| 字段 | 含义 |
| --- | --- |
| `id` | 稳定句柄（`machineKey` + 语义签名），供勾选与画布高亮 |
| `kind` | `state` / `transition` / `guard` / `doc-rule` |
| `oursPresent` | 当前图表有没有这一条 |
| `theirsPresent` | 文件里新来的有没有这一条 |
| `labelOurs` / `labelTheirs` | 给人看的短句（如「打开变更依赖」），不是 uid |
| `defaultPick` | `ours` / `theirs` / `both` 的建议默认值：仅 ours→`ours`，仅 theirs→`theirs`，两侧都有且不同→不默认，须人手勾 |

`diffOurs = computeMachineDiff({ baseline: base, current: ours })`  
`diffTheirs = computeMachineDiff({ baseline: base, current: theirs })`  
再把两边 added/removed/modified 对齐成条目。同签名两边都加且内容相同 → 一条「已一致」，不进待勾选列表。

`applySyncPicks(ours, items, picks, nowIso)`：

- `ours`：该条只留在当前图（文件里新来的那侧不并入）
- `theirs`：用文件里新来的替换当前图上对应条
- `both`：两条都留在当前图（不同事件名/不同到达状态时各画一条边；同签名冲突禁止 `both`，函数返回可给测试看的 `blocked` 原因，界面改说「这两条是同一件事，请选留哪一条」）

函数零 I/O、零 `Date.now()`；`nowIso` 仅用于世界线条目时间戳。合并结果写回 `machines.*.current`（或 `docDrafts.currentText` 的结构化补丁），**不**写 `llmanspec/specs/`。

非状态机规格：`docDrafts` 按规则标题/req 粒度出条目，勾选后补丁进 `currentText`，同样不直写磁盘规格。

---

## D2 冲突检测、自动拍照与刷新基线

沿用现有 `baseHashes` / `staleFiles` / preview-diff `stale`。bootstrap、SSE `specs-changed`、保存前重算磁盘哈希，任一目标文件过期即进入同步态。

进入同步态时（每个 `machineKey` / `docDraft` 最多一次，直到本次裁决结束）：

1. `recordWorldlineCommit(..., { actor: 'human', label 内部可记 snapshot-before-sync })`，界面世界线格子写 **「刚才在画布上的版本」**；
2. 底栏操作区上方向上展开冲突条（注意图标，不占用顶栏单槽；顶栏仍 Compare > Drift > Simulate > Tips，遵守 `@req:r147`）；
3. 当前图保持可交互，叠加差异（本画布实线琥珀色闪烁，文件里新来的用绿色虚线闪烁，点条目时对应区域加强闪烁）。

裁决全部勾完并确认「做完了」：

1. 跑既有方言 Linter；
2. 把该文件的 `baseHashes[file]` 更新为 **当前磁盘** 内容的哈希（承认 REMOTE 已读入），草稿仍在 `current`；
3. 真正写回 `.feature` 仍走底栏「保存变更」与 `@req:r137` 分支护栏，本 change **不**新开口径直写主干。

`PUT /api/states/:id` 的 `409` 仍表示多 Tab 抢同一份草稿 revision，与「文件被别人改了」分开：前者提示「另一扇窗口刚保存了这份草稿」，后者走本设计的图上同步。禁止用同一句文案混为一谈。

---

## D3 图上对比与勾选（Studio Web）

主路径不是独立「文本 Diff 工具」，是 **当前图表 + 条目清单**：

```text
操作栏上方（向上展开）：
  [注意] 规格在别处改过了 · N
  这份规格在别处被改过了。你在画布上的修改还在。
  [本画布] [文件] [做完了] [对照]
    ┌ 你在本画布的调整 ┐  ┌ 文件里新来的 ┐
    │ 已取消           │  │ 没有         │
```

- **对照**：向上展开双列卡片（不新开路由）。每条点左侧留画布、点右侧留文件；必要时 `[两条都留]`。点条目则画布聚焦并加强闪烁对应节点或边。
- **本画布 / 文件**：把所有待勾选条目批量设为 `ours` 或 `theirs`（title 仍为「先留我刚改的 / 先用文件里的」），仍要「做完了」才提交，避免误触立即丢图。
- 画布叠加与清单勾选双向同步。世界线那一格始终可点回去，覆盖本次未确认的勾选。

文案表（生产界面只许左列）：

| 写给使用者 | 禁止出现 |
| --- | --- |
| 这份规格在别处被改过了。你在画布上的修改还在。 | BASE / LOCAL / REMOTE / stale / baseHash / 409 |
| 已帮你在「世界线」里留了一份刚才的版本 | 自动快照 / timeline commit |
| 你在本画布的调整 / 文件里新来的 | ours / theirs |
| 留我刚改的 / 用文件里的新内容 / 两条都留 | 采纳磁盘更新 / 三方合并 |
| 还有人在改 · N | SSE / Agent activity / worktree |
| 有人在「…」留下了看法 | comment on macro-edge |
| 另一处工作区刚保存了这份规格 | state-updated / peer |
| 另一扇窗口刚保存了这份草稿 | revision conflict |
| 刚才在画布上的版本 | snapshot-before-sync（可留在内部 id） |
| 这两条是同一件事，请选留哪一条 | blocked both / signature clash |

---

## D4 活动小标记（不抢冲突条）

默认右上角工作区胶囊旁一颗 **「还有人在改 · N」**（N=未读条目数，0 则整颗隐藏）。点开浮层列出白话条目，一键跳到锚点。

计入条目（打开会话即从当前草稿折叠评论与漂移建议，后续推送只增量；本端 `originClientId` 回声丢弃）：

- `state-updated` 且来自其他 client / 其他 wsKey 同实例 → 「另一处工作区刚保存了这份规格」
- 新的 `open` 评论且 `author: 'agent'` → 「有人在「{锚点短句}」留下了看法」
- 新的 `pending` 且 `source: 'drift-trace'` → 「代码运行里看到了规格里没有的变化」（沿用逻辑漂移校准，不另起一套词）

冲突条展开时，活动只留小标记，不升格为第二条横幅。

---

## D5 评论关注标签与 Prompt 子集

就近评论浮窗增加可选标签（界面：「请谁看」），取值 `human` / `agent` / 自由短标签，存在 `StudioComment` 的向后兼容可选字段，缺省等于现有 `author`。

「生成调整 Prompt」增加 **只带未解决且勾选的评论**。未勾选时行为与今天一致（全部未解决评论）。不引入 `@agent` 字面出现在生产按钮上；按钮写「只带我勾的看法」。

---

## D6 Hub 与 CLI

| 端点 / 命令 | 职责 |
| --- | --- |
| `POST /api/states/:id/sync-preview` | 读磁盘重解析 `theirs`，返回 `SyncItem[]` + 是否 stale；不写盘 |
| `POST /api/states/:id/sync-apply` | body：`picks`；服务端调 `applySyncPicks`，写入草稿与世界线（若尚未拍过本次冲突格），返回新 `StudioStateDoc`；**零写 specs** |
| `GET /api/events` | 现有 SSE；前端把事件折叠为 D4 条目，不必新事件 type（需要时可加可选 `comment-added`，首版用 `state-updated` 后拉评论列表即可） |
| `llman-sdd studio diff` | `--json` 时若 stale，多输出 `syncItems`（内部字段名）；人读模式加一段「文件和画布对不上」+ 条目短句，不用三字母 |

`studio apply` 护栏不变。同步只改草稿。

---

## 测试边界（Seam）

1. **纯域**（`tests/unit/studio/sync.test.ts`）：ours-only / theirs-only / both / 同签名禁止 both；合并后 `computeMachineDiff` 与勾选一致；注入时钟的世界线快照；零 `node:`。
2. **Hub**（集成测）：构造磁盘文件哈希前进，`sync-preview` 给出条目，`sync-apply` 后 specs 目录零修改、`baseHashes` 更新、`409` 文案路径不与同步冲突混用。
3. **Web 文案与单槽**：单测或 e2e 扫描同步条与活动标记的可见文本，断言不含文案表右列；冲突条可见时顶栏中轴可见浮条数 `<= 1`。
4. **BDD**：`studio-core` 增三方条目与 apply 场景；`studio-web` 增白话提示与图上勾选场景；`studio-cli` 增 `studio diff` stale 条目场景。规格在绑定分支提交，本文件不改 `llmanspec/specs/`。

前后对比类完成判据在 change 分支上相对 merge-base 测量。
