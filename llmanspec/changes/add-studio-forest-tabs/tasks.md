# Tasks: add-studio-forest-tabs

> 验收 Seam：① `packages/core` 纯域 4 类规格森林投影、交叉桥算法、`W3` 孤立检查与 `views.json` zod 校验单测；② `/api/views` 按实例隔离原子读写集成测试 + 前端默认单 Tab、动态工作区 `+ 新标签页` 与空态兜底、`Shift+拖框` 领域分组/建 Tab、1 跳外部接口、外部契约门户、`d3-force` 静态排布单测 + `rsbuild build` 与全仓 `just qa`。

- [ ] T1 实现纯域宏观森林投影、交叉桥算法与视图存储契约：在 `packages/core/src/studio/forest.ts` 实现 `buildForestGraph(entries)`（0-Token 识别 `machine`/`flow`/`decision`/`doc` 4 类规格、权重与 `tags[]`，扫描跨能力 `@req:rXX` 引用与共享事件生成自动实线与 `evidence[]`）、`computeCrossForestBridges(graph, groups)`、`W3` 孤立规格检查与 `.llman-sdd/studio/views.json` 的 `zod` schema / 端口接口（聚焦对已有 `llmanspec/` 双向映射，不做外部格式导出），在 `packages/core/src/index.ts` 导出并补齐 `tests/unit/studio/forest.test.ts`。

- [ ] T2 `[blocked-by: T1]` 实现按实例隔离的服务端视图路由与浏览器级多 Tab 管理：在 C3 本地回环服务挂接 `GET/PUT /api/views`（防抖自动保存 + 临时文件原子 `rename`，按 `llmanspec/` 实例隔离）并接入 SSE 刷新；在前端实现默认单置顶 **「主视图」** Tab（单色 SVG 图标，无彩色 Emoji）、浏览器级右键 Tab 菜单（置顶与拖拽排序，不做 Tab 分组）、按当前工作区动态生成的 `+ 新标签页`（动态聚合真实规格与 `#tag (count)`，绝不跨仓串味）及 0 命中空态恢复卡，补齐服务端与 store 单测。

- [ ] T3 `[blocked-by: T2]` 实现宏观拓扑画布（统一 `@xyflow/react` + 避障/互斥路由）、排他领域分组框选与跨森林交叉桥：挂载 `ForestMacroCanvas` 至 C3 `CanvasAdapter` 插槽，卡片摘要固定 2 行截断（`@req` 预览上限 3 条），静态分组排布并尊重 `macroPositions`；复用 C3 避障通道路由（零穿卡）、边/标签互斥与连线标签手拖微调；实现左下可点击图例作为唯一节点类型筛选器；实现按工作区隔离、最低层级（`z-index: 0`）且带 **排他空间守卫**（绝不误包非成员）的领域分组容器、`Shift+拖拽` 框选批量操作条（`打包分组 (G)` / `新建 Tab 视图 (T)` / `打 Tag`）、自定义 Tab 的 `+ 显示外部 1 跳接口` 开关、大图「聚焦邻接」、实/虚线区分、拖端口至空白 5 选 1 选建圆盘与「交叉桥」高亮；卡片与主视图连线右键严格遵循无重复契约并统一接入 C3 就近评论浮窗与 `分享状态`；严格执行宏观写入红线（规格卡结构性增/删/改名仅进草稿与协商 Prompt/`proposal.md`，绝不直改 `llmanspec/specs/*.feature`），补齐排布、排他分组、红线边界与交叉桥单测。

- [ ] T4 `[blocked-by: T3]` 实现外部契约门户联动、全景聚合 Prompt 与全仓门禁验证：在 C3 状态机/流程图画布外围渲染自动提取的外部上游约束/下游契约门户与跨界虚线，点击门户就近弹出 `evidence` 预览并提供「新 Tab 打开 / 回到全景」双动作；联调全景时间线净 Diff 聚合 Prompt（带精确对象 `uid` 锚点与方言门禁提示）；验证 `rsbuild build` 与全仓 `just qa` 全部变绿。
