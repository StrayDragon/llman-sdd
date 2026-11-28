# 嵌套贴框导航与视口记忆 — 任务

> 验收 Seam：① 下钻文案与视口 key 纯函数单测；② `studio-web` 新规则 BDD；③ nest e2e 断言 `data-nest-crumb` 在边界框内。前后对比在 change 分支上相对 merge-base 测量。

- [x] T1 纯函数：`divePillLabel`、`machineCanvasViewKey`（`apps/studio/src/nest/chrome.ts`）与单测。
- [x] T2 `[blocked-by: T1]` 画布：返回上层贴边界框左上；下钻文案；`viewKey` 含 nest 路径；首次 fitView。
- [x] T3 `[blocked-by: T2]` 规格 `studio-web` r176 与 BDD 步骤；更新 `tests/e2e/studio/nest-run.ts` 断言贴框。L1 → L2 → e2e nest-run。
