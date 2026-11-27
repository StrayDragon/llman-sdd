# Tasks: add-studio-e2e-visual-invariants

> 验收 Seam：① `tests/e2e/studio/invariants.ts` 纯几何判定器（由 `studio-web.feature` 新规则的嵌套场景经 `tests/bdd/steps/studio-web.ts` 驱动）；② `just qa-studio-e2e` 真实浏览器门禁（独立 recipe，不进 `just qa`）。

- [ ] T1 落地纯几何判定器与 BDD 绑定：实现 `tests/e2e/studio/invariants.ts`（6 条设计真言判定 + 文案洁癖扫描），在 `tests/bdd/steps/studio-web.ts` 绑定新规则场景，并补 `tests/unit/studio/e2e-invariants.test.ts`。

- [ ] T2 `[blocked-by: T1]` 落地真实浏览器门禁骨架：精确锁定 `playwright-core@1.61.1`；实现 `tests/e2e/studio/run.ts`（临时 git 夹具仓、进程内 `startStudioHub` 端口 0 且不写 hub 文件、双视口、失败截图）；新增 `just qa-studio-e2e` recipe；前端补最小 `data-testid` 钩子。

- [ ] T3 `[blocked-by: T2]` 接入 6 条设计真言与近期回归断言并跑通：主视图与 `studio-web` 状态机 Tab 的几何断言、世界线抽屉同侧、顶栏单槽、拖拽零 `pageerror`、小地图有预览、禁用原生右键、新标签页无小贴士、跨工作区与刷新零丢失；对首次跑出的违规按 design D6 修复或登记豁免。

- [ ] T4 `[blocked-by: T3]` 全量验证：`just qa`、`bun run build`、`just qa-studio-e2e` 全绿；`llman-sdd validate add-studio-e2e-visual-invariants --strict` 通过。
