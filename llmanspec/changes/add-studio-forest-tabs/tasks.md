# Tasks: add-studio-forest-tabs

> 验收 Seam：① `packages/core` 纯域森林投影与交叉桥算法单测（含跨能力 `@req:rXX` 引用与共享事件、`views.json` zod 校验）；② `/api/views` 原子读写集成测试 + 前端多 Tab 切片/面包屑下钻/边界邻居气泡预览/`d3-force` 静态排布单测 + `rsbuild build` 与全仓 `just qa`。

- [ ] T1 实现纯域宏观森林投影、交叉桥算法与视图存储契约：在 `packages/core/src/studio/forest.ts` 实现 `buildForestGraph(entries)`（0-Token 扫描权重、跨能力 `@req:rXX` 引用与共享状态机事件生成自动实线与 `evidence[]`）、`computeCrossForestBridges(graph, groups)` 与 `.llman-sdd/studio/views.json` 的 `zod` schema / 端口接口（聚焦对已有 `llmanspec/` 双向映射，不做外部格式导出），在 `packages/core/src/index.ts` 导出并补齐 `tests/unit/studio/forest.test.ts`。

- [ ] T2 `[blocked-by: T1]` 实现服务端视图路由与多 Tab 状态管理：在 C3 本地回环服务挂接 `GET/PUT /api/views`（临时文件 + 原子 `rename` 写盘）并接入现有 SSE 刷新；在前端 Zustand store 与顶栏实现 `[ 默认全景 ]` `[ 自定义组合 N ]` `[ + ]` Tab 栏、拉入业务森林子集、人工参考虚线与视觉分组（绝不污染 `llmanspec/specs/`），补齐服务端与 store 单测。

- [ ] T3 `[blocked-by: T2]` 实现宏观星图（`d3-force`）与跨森林交叉桥高亮：挂载 `ForestMacroCanvas` 至 C3 `CanvasAdapter` 插槽，使用 `d3-force` 做一次性静置排布并尊重人类手拖 `macroPositions`，按权重渲染圆球尺寸、实/虚线区分规格事实与个人参考标注，提供「只看交叉桥」开关淡化非桥接元素并支持对交叉边挂锚定评论，补齐排布无 NaN 与交叉桥过滤单测。

- [ ] T4 `[blocked-by: T3]` 实现上下文边界保留下钻与全仓门禁验证：双击业务圆球切入 C3 确定性 `elkjs` 状态机画布并维护顶部面包屑返回栈；在容器外围渲染外部邻居气泡与出入箭头，点击气泡先弹交叉 `evidence` 轻预览再提供「拉入当前 Tab 对比 / 跳转」双动作；验证 `rsbuild build` 与全仓 `just qa` 变绿。
