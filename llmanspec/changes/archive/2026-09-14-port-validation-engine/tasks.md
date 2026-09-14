# Tasks

测试边界(seam):`packages/core` 的 `validateCapability`/`validateAllSpecs`(bun:test 单元 + `@executable` BDD)+ `apps/cli validate` 子命令(子进程级 BDD 步骤)+ golden 归一化对照脚本。

- [x] T1 core 校验域:`validateCapability`/`validateAllSpecs` 条目化聚合(规则域见 design)+ 单元测试
- [x] T2 扫描入口:`discoverSpecs` port 注入式列目录 + 单元测试
- [x] T3 CLI:`apps/cli` 增 `validate --specs [--check|--no-check] [--strict]` 子命令,退出码语义 + 集成测试
- [x] T4 golden:validate-fixture 种子缺陷仓库 + `check-validate.ts` 归一化对照(v1 ↔ v2 条目行集合一致)
- [x] T5 BDD:`@executable` 场景落 validation.feature 并接线(domain steps 调 CLI/core)
