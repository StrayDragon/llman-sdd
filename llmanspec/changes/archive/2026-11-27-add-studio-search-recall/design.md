# Design: Studio 面板内搜索（⌘F）与工作区深度搜索召回（BM25 + 可选 RAG 槽）

## D1 Tier 0 本地确定性全文倒排 / BM25 引擎（`packages/core/src/studio/search.ts`）

纯函数、零 I/O、零 `node:*`、零外部依赖：

- **中英混合分词（`tokenizeSearchText`）**：保留 ASCII 字母数字与 `@req:rN` 标识符词元，并对连续汉字（`\p{Script=Han}`）同时切分 unigram 与 bigram，解决中文短语无空格导致普通 BM25 零召回的问题。
- **按工作区隔离的统一索引文档（`buildWorkspaceSearchDocuments`）**：索引当前工作区全部规格的规则标题与正文、Scenario 步骤、转移事件与守卫、决策表单元格、未解决/已解决评论及世界线变更摘要，不跨工作区混杂。
- **BM25 排序与片段摘要（`searchWorkspaceBm25`）**：输出带 `score`、命中上下文 `snippet` 与精确直跳锚点（`targetKind`、`capId`、`machineKey?`、`targetId`）的有序结果。

## D2 Tier 1 可选外部 RAG 语义召回代理（复用 TextFold 双层架构）

- **契约**（`packages/core/src/studio/contracts.ts`）：新增 `studioSearchRequestSchema`、`studioSearchHitSchema`、`studioSearchResponseSchema`；最小外部 HTTP 协议为 `POST <endpoint>/search` `{ query, workspaceKey, topK }` → `{ hits: [{ targetKind, targetId, capId?, machineKey?, title?, score, snippet }] }`。
- **安全与降级**（`apps/cli/src/studio-server/server.ts`）：
  - 新增 `POST /api/search` 与 `POST /api/p/:wsKey/search`；
  - 外部 RAG 地址仅经环境变量 `LLMAN_SDD_STUDIO_RAG_URL`（可选鉴权头仅走环境变量 `LLMAN_SDD_STUDIO_RAG_TOKEN`，绝不落入入库 `config.yaml`，保持 `config-schema` r5 零破坏）或前端显式回环地址启用；
  - 严格执行回环 SSRF 守卫（`isLoopbackHost`，非回环直接返回 `400`），4 秒超时 + 工作区级内存短缓存，不可达或响应非法时无感降级回 Tier 0 `local-bm25` 并附 `degradedReason`；
  - UI 明确展示召回来源徽章（`RAG 语义` / `本地全文`），零内置大模型 Key 耦合。

## D3 面板内搜索（`⌘F`）与 `⌘K` / `+ 新标签页` 深度召回整合

- **就近面板内搜索条**（`apps/studio/src/components/InPanelFindBar.tsx`）：
  - 在 Studio 页面拦截 `⌘F` / `Ctrl+F` 弹出右上紧凑搜索条（不占用顶栏单槽，遵守真言 2），支持 `Enter` / `Shift+Enter` 逐条跳转、`i / N` 计数与 `Esc` 关闭；
  - 宏观/组合视图：匹配卡片标题/摘要/规则编号，高亮命中卡片并淡化无关项，自动平滑居中；
  - 状态机/流程图视图：同步穿透检索当前状态机及 L2/L3 嵌套子图的状态、事件与守卫，跳转跨层命中时自动定位或提示下钻；
  - 规则文档/决策表视图：同步联动规则筛选与高亮定位。
- **注册表同步**：`⌘F` 接线完成后同步注册进 `STUDIO_SHORTCUT_REGISTRY`（`?` 速查卡自动出现，零占位）。
- **`⌘K` 与 `+ 新标签页` 深度全文召回**：输入 `>= 2` 字符时防抖查询 `/api/p/:wsKey/search`，展示带摘要片段与来源标识（`RAG 语义` / `本地全文`）的排序命中并一键直跳。

## Open Questions 决议

- `⌘F` 穿透 L2/L3 嵌套子图：采用，跳转至子图状态时自动切换到对应 `machineKey` 并聚焦高亮。
- 外部 RAG HTTP 契约：采用最小 `{ query, workspaceKey, topK }` → `{ hits: [...] }`，鉴权仅经环境变量 `LLMAN_SDD_STUDIO_RAG_TOKEN`。
