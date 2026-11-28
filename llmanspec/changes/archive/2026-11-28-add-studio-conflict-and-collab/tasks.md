# Tasks: add-studio-conflict-and-collab

> 验收 Seam：① `packages/core/src/studio/sync.ts` 纯域 `SyncItem` / `applySyncPicks` 单测（由 `studio-core.feature` 新规则嵌套场景驱动）；② `POST /api/states/:id/sync-preview|sync-apply` 与 `studio diff` stale 条目（由 `studio-cli.feature` 新规则嵌套场景驱动，断言零写 `llmanspec/specs/`）；③ 图上勾选合并进当前图表、白话冲突条、活动小标记（由 `studio-web.feature` 新规则嵌套场景驱动）+ 文案表右列禁词扫描。前后对比在 change 分支上相对 merge-base 测量。

- [x] T1 实现纯域三方条目与勾选合并：在 `packages/core/src/studio/sync.ts` 实现 `buildSyncItems` / `applySyncPicks`（ours / theirs / both，同签名禁止 both；时钟经 `nowIso` 注入）；向后兼容扩展评论可选「请谁看」字段；Zod 契约放 `contracts.ts`；导出至 `packages/core/src/studio/index.ts` 与 `packages/core/src/index.ts`；补齐 `tests/unit/studio/sync.test.ts`（含世界线快照注入时钟、零 `node:`）。

- [x] T2 `[blocked-by: T1]` 落地 Hub 同步接口与 `studio diff` stale 条目：在 `apps/cli/src/studio-server/server.ts` 实现 `POST /api/states/:id/sync-preview`（只读重解析磁盘）与 `POST /api/states/:id/sync-apply`（写草稿与世界线「刚才在画布上的版本」、更新 `baseHashes`、零写 specs）；`409` 与文件过期走不同白话提示；`studio diff` 人读/JSON 在 stale 时输出「文件和画布对不上」及 `syncItems`；补齐 Hub 集成测试与 `studio-cli` BDD 步骤。

- [x] T3 `[blocked-by: T2]` 实现图上对比、勾选合并进当前图表与顶栏白话冲突条：`staleFiles` 进入同步态时自动拍世界线一格；顶栏单槽文案与按钮按设计 D3 文案表（冲突条优先于对比/漂移/小贴士）；画布叠加「你刚画的」与「文件里新来的」，清单与画布双向聚焦；「先留我刚改的 / 先用文件里的」只预填勾选，「做完了」才 `sync-apply` 并跑 Linter；生产可见文本不含文案表右列；补齐前端单测与 `studio-web` BDD 步骤。

- [x] T4 `[blocked-by: T3]` 实现活动小标记、评论「请谁看」与 Prompt「只带我勾的看法」：右上角「还有人在改 · N」（N=0 隐藏），点开白话条目并跳转锚点；冲突条占用单槽时活动不升格为第二条横幅；评论浮窗可选「请谁看」；生成调整 Prompt 支持只带勾选的未解决看法；补齐单测。

- [x] T5 `[blocked-by: T2, T3, T4]` 在绑定分支提交 `studio-core` / `studio-web` / `studio-cli` 规格对齐、跑 `just qa`（含 `qa-studio-e2e`）：核对分支上 `llmanspec/specs/` 与实现一致（新 `@req` 从 `spec next-req-id` 起编），断言同步条可见时顶栏中轴浮条 `<= 1`，全仓门禁相对 merge-base 全绿。

- [x] T6 `[blocked-by: T5]` 补真实浏览器冲突路径枚举：无过期、进入同步态、对照点选与聚焦闪烁、收起展开、本画布/文件批量、混合勾选、活动小标记与请谁看、多 Tab 409 文案、同签名禁止两条都留；`just qa-studio-e2e` 覆盖上述路径且生产可见文本不含文案表右列。

- [x] T7 `[blocked-by: T6]` 把 `qa-studio-e2e` 纳入 `just qa` 聚合（全部 `qa-*` 单门均被 qa 覆盖，更新 r2/r156 与 quality-gates）；开盘即折叠已有 agent 评论与 drift 建议；同签名对照改为互斥点选视觉（「或」，不提供两条都留）。
