# Tasks: add-studio-search-recall

> 验收 Seam：① `packages/core/src/studio/search.ts` 纯域中英 bigram+BM25 检索引擎与片段摘要单测（由 `studio-core.feature` 新规则嵌套场景驱动）；② `POST /api/p/:wsKey/search` 回环 SSRF 拦截、Tier 1 代理与降级 Tier 0 集成测试 + 前端 `⌘F` 面板内搜索与 `⌘K` 深度召回（由 `studio-web.feature` 新规则嵌套场景驱动）+ `just qa` / `bun run build` / `just qa-studio-e2e`。

- [ ] T1 实现纯域中英双字分词与 BM25 工作区检索引擎及 Zod 契约：在 `packages/core/src/studio/search.ts` 实现 `tokenizeSearchText`、`buildWorkspaceSearchDocuments`、`searchWorkspaceBm25`、`extractHighlightSnippet`；在 `contracts.ts` 新增 `studioSearchRequestSchema` / `studioSearchResponseSchema`；导出至 `packages/core/src/studio/index.ts` 与 `packages/core/src/index.ts`；补齐 `tests/unit/studio/search.test.ts` 与 `studio-core` BDD 步骤。

- [ ] T2 `[blocked-by: T1]` 落地本地回环服务 `/api/search` 与 `/api/p/:wsKey/search`（含可选 RAG 代理与降级）：在 `apps/cli/src/studio-server/server.ts` 实现按工作区隔离的 Tier 0 本地 BM25 索引检索与可选 Tier 1 回环 RAG 代理（SSRF 拦截、4s 超时、短缓存、无感降级回 `local-bm25`）；在 `apps/studio/src/api/client.ts` 接入 `searchWorkspace`；补齐服务端集成测试。

- [ ] T3 `[blocked-by: T2]` 实现 Studio 面板内搜索（`⌘F`）与 `⌘K` / `+ 新标签页` 深度召回展示：新增 `apps/studio/src/components/InPanelFindBar.tsx`（含 L2/L3 嵌套子图穿透与画布高亮居中）；在 `App.tsx`、`StateMachineCanvas.tsx`、`SpecDocCanvas.tsx`、`Modals.tsx`、`NewTabQuickPage.tsx` 与 `studioStore.ts` 接入 `⌘F` 与深度召回来源标识（`RAG 语义` / `本地全文`）；在 `shortcuts.ts` 注册 `⌘F`；补齐 `studio-web` BDD 步骤与 E2E `⌘F` 断言。

- [ ] T4 `[blocked-by: T3]` 全量验证：`just qa`、`bun run build`、`just qa-studio-e2e` 与 `llman-sdd validate add-studio-search-recall --strict` 全绿。
