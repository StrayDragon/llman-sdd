# Tasks

测试边界(seam):`packages/core` review 聚合与 freeze 编排纯函数(单元)+ 7z 适配器 roundtrip(单元)+ v1↔v2 双向兼容(临时仓库集成)+ 活体 golden + BDD `@executable`。

- [ ] T1 review 聚合核心:信号计算(pending/manual/unbound/stale 占位/validate/locked)+ JSON 与文本渲染 + 退出码 + 单元测试
- [ ] T2 review CLI 接线(`--capability/--json/--export-html`)+ shared/review.html 渲染 + 活体 golden(review 归一化对照)
- [ ] T3 7z 适配器:7z-wasm 封装(a/l/x + NODEFS 挂载)+ roundtrip 单元测试
- [ ] T4 freeze/thaw 编排:候选选择(before/keep-recent/dry-run/list)+ 冻结删原目录 + thaw 回置 + CLI + 单元测试
- [ ] T5 双向兼容集成:临时仓库 v1 freeze ↔ v2 thaw、v2 freeze ↔ v1 thaw + BDD `@executable` 场景
