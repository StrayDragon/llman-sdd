# Tasks

测试接缝(seam):复用既有 seam——golden 基线(r19 渲染等价门)+ init 冒烟(tests/integration/binary.test.ts 既有模式),不发明新 seam。

- [x] T1: Specs landing——init-generators.feature 新增 r66(@human:skills 撰写引导 MUST 含 @human/@executable 分流判据;@executable:渲染 zh-Hans propose 断言判据小节存在),commit [blocked-by: 无]
- [x] T2: 模板落地——zh-Hans/en 的 propose 4b 与 validation-hints 四文件增判据;`bun run golden:generate` 重建基线;`just golden` 过 [blocked-by: T1]
- [x] T3: 狗粮同步 + 门禁——本仓库 `init --update` 重渲染 .agents/skills;`just qa`、`validate --all --strict`、review 全绿 [blocked-by: T2]
- [x] T4: 收口——finalize 归档;移除 _HANDOFF.md(程序收官,跟踪职责由 specs/changes SSOT 接管) [blocked-by: T3]
  <!-- 补勾(2026-09-23):归档与 _HANDOFF.md 移除均已完成(8c615fb),当时手工批量归档绕过 r40 任务门致漏勾 -->
