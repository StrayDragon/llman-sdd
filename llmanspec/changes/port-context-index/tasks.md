# Tasks

测试边界(seam):`packages/core` context 域纯函数(单元)+ Bun.serve mock OpenAI 服务器驱动 agentic loop(集成)+ `@executable` BDD(临时仓库 CLI)+ v1 活体对照(index rebuild/check 输出)。

- [ ] T1 tree 构建:buildTreeIndex(IR → docs/reqs/scenarios)+ computeSpecHash + 单元测试
- [ ] T2 index 编排:rebuild(含 .rebuild.lock 互斥/陈旧清理)与 check 新鲜度 + 单元测试
- [ ] T3 context agentic loop:OpenAI 兼容客户端 + 三工具执行器 + 12 轮上限收敛 + Bun.serve mock 集成测试
- [ ] T4 CLI:`index rebuild/check` + `context --task/--paths/--top`(env 契约、quality=unavailable)+ v1 活体对照(rebuild/check 输出归一)
- [ ] T5 BDD `@executable`:rebuild → check fresh → 改 spec → stale → rebuild;model 未设 → quality=unavailable
