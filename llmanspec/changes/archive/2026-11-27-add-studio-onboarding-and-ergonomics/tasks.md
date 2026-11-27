# Tasks: add-studio-onboarding-and-ergonomics

> 验收 Seam：① `apps/studio/src/ergonomics/` 纯域辅助（快捷键注册表、多选对齐/分布/重排、6 步向导定义、WCAG 对比度验证）由 `studio-web.feature` 新规则嵌套场景经 `tests/bdd/steps/studio-web.ts` 驱动 + `tests/unit/studio/ergonomics.test.ts`；② `just qa` + `bun run build` + `just qa-studio-e2e` 真实浏览器回归全绿。

- [x] T1 落地纯前端人体工学模块与 BDD 绑定：实现 `apps/studio/src/ergonomics/shortcuts.ts`、`guidedTour.ts`、`layoutTidy.ts`、`contrast.ts`；在 `tests/bdd/steps/studio-web.ts` 绑定新规则场景，并补齐 `tests/unit/studio/ergonomics.test.ts`。

- [x] T2 `[blocked-by: T1]` 落地缩略视角对比度打磨与只读 SVG/PNG 快照导出：在 `apps/studio` 锁定 `html-to-image@1.11.13`；实现 `apps/studio/src/ergonomics/exportSnapshot.ts`；更新 `apps/studio/src/index.css` 与 `StateMachineCanvas.tsx` 的双皮肤边框/分组框/连线对比度（满足 WCAG >= 3:1）。

- [x] T3 `[blocked-by: T2]` 接入交互式向导、`?` 快捷键速查卡与多选键盘/对齐流：新增 `apps/studio/src/components/ErgonomicsModals.tsx`（`?` 速查弹窗 + 6 步向导浮卡）；在 `BottomChrome.tsx` `画布` 设置接入「交互式引导向导」与「导出只读快照（SVG/PNG）」；在 `App.tsx` 与 `StateMachineCanvas.tsx` 接入 `?`、`G`/`T`、方向键微调及多选对齐/分布/整理按钮；在 `tests/e2e/studio/run.ts` 追加 `?` 速查与对比度检查。

- [x] T4 `[blocked-by: T3]` 全量验证：`just qa`、`bun run build`、`just qa-studio-e2e` 与 `llman-sdd validate add-studio-onboarding-and-ergonomics --strict` 全绿。
