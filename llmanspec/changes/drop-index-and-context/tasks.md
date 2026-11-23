# 任务：移除索引与检索

测试边界（seam）：CLI 未知命令与 `init` 版本戳走 `tests/bdd/`；版本戳读写若拆成纯函数，用 `tests/unit/` 直接导入。规格改动只在绑定分支上提交。

- [ ] T1: 在绑定分支删除 `context-index` 规格；在 `cli` 增加 `index` / `context` 未知命令场景；在 `init-generators` 写版本戳新路径与旧路径只读回退
- [ ] T2: 删除 index、context 的命令注册、检索实现，以及 `LLMAN_SDD_INDEX_*` 读取 [blocked-by: T1]
- [ ] T3: 版本戳改为 `llmanspec/.sdd-state.json`，读取回退旧路径，写入只写新路径 [blocked-by: T1]
- [ ] T4: 删除 `index-fallback` 单元及其引用，技能中的定位步骤改为 `list --specs` 加直读 `.feature` [blocked-by: T2]
- [ ] T5: 补 BDD 与单测，使 T1 的场景可执行，并去掉依赖已删除命令的步骤 [blocked-by: T2, T3, T4]
- [ ] T6: `migrations/v0.10-v0.11/README.md` 说明命令与环境变量已移除，`.context/pageindex/` 可自行删除 [blocked-by: T5]
