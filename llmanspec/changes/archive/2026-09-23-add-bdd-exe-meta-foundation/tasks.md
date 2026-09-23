# Tasks

测试接缝(seam):core 纯函数直调(renderTemplate/renderWithUnits/normalizeLocale/localeFallbacks/loadLocaleResource/loadUnitRegistry)+ CLI 子进程(archive freeze,仿 domain.ts 既有形态)+ smoke 全局命令步骤(r1-r4 只读文件对账脚本)。

- [x] T1: design/tasks 形式化,`validate add-bdd-exe-meta-foundation --no-interactive` 通过 [blocked-by: 无]
- [x] T2: Specs landing——init-generators(r17/r18)、monorepo-structure(r1-r4)、review-freeze(r24)各加 `@req:<id> @executable` 场景;commit [blocked-by: T1]
- [x] T3: 实施——`tests/bdd/steps/meta-foundation.ts`(r17/r18 渲染与 locale 步骤、r24 freeze 步骤 + 7z 依赖守卫)+ `tests/bdd/assert/{monorepo-layout,quality-gates,core-purity,bdd-runner}.ts` 对账脚本;run.test.ts 追加 import 行 [blocked-by: T2]
- [x] T4: 门禁全绿——`just qa` / `just golden` / `just pending-gate` / `validate --strict --no-interactive` / `review`;三个目标 capability pending 归 0 [blocked-by: T3]
- [x] T5: 收口——tasks 全勾、`show --output json` readyToImplement=true、`format:write`、树净 [blocked-by: T4]

<!-- 偏差记录(已知,不修):`validate --all --strict` 可能因其他 capability spec 的 STALE 报 ERROR——本 change 按约束只动三个目标 spec 与 tests/,不修他人 scope;本 change 的 `validate add-bdd-exe-meta-foundation --strict` 与 `review` 必须为 0。 -->
