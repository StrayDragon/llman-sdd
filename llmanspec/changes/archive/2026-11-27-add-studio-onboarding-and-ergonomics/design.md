# Design: Studio 交互式向导、快捷键体系、排版导出与缩略对比度打磨

## D1 注册表驱动的 `?` 快捷键速查卡与键盘流

- **单一真源注册表**（`apps/studio/src/ergonomics/shortcuts.ts`）：按视图方言（`global` / `macro` / `machine` / `doc`）声明快捷键元数据，严格**只登记当前已真实接线的快捷键**（遵守真言 6，绝不列占位项；后续 `add-studio-search-recall` 落地 `⌘F` 时直接追加注册项）。
- **键盘流补齐**：
  - `?`（非输入框焦点）切换快捷键速查弹窗（按当前 Tab 视图默认过滤，可切换「全部」）；
  - 宏观视图多选态（`selectedMacroIds.length >= 2`）：`G` 一键打包手动分组、`T` 一键新建组合 Tab；
  - 方向键（`ArrowUp/Down/Left/Right`）微调当前选中节点坐标（默认 `8px`，按 `Shift` 为 `24px`），仅写冷表 `stateDoc.layouts`（零语义 Diff）。

## D2 按需呼出的 6 步交互式引导向导

- **入口克制**：收口至 `画布` 设置面板内「交互式引导向导」按钮，默认绝不自动弹窗打断老用户；浏览器 `localStorage` 记录完成态（`llman-sdd:studio:tour-v1`）。
- **`--demo` 首次体验提示**：仅在 `demoMode && !tourDone` 时，在顶栏小贴士单槽内附带轻量「6 步向导」快捷按钮（严格复用单槽，遵守真言 2 零叠加）。
- **6 步引导定义**（`apps/studio/src/ergonomics/guidedTour.ts`）：全景进入 Tab → 拖线选建 → 盒中盒 3 层下钻 → 右键统一评论 → 世界线对比与协商 → 保存变更护栏；支持上一步/下一步/跳过/重播。

## D3 多选对齐/等距分布与只读 SVG/PNG 快照导出

- **纯函数多选排版**（`apps/studio/src/ergonomics/layoutTidy.ts`）：
  - `alignSelectedNodes(ids, positions, sizes, mode)`：`left` / `centerX` / `right` / `top` / `centerY` / `bottom`；
  - `distributeSelectedNodes(ids, positions, sizes, axis)`：`horizontal` / `vertical` 等距分布（`>= 3` 节点生效）；
  - `tidySelectedGrid(ids, positions, sizes)`：局部紧凑网格重排；
  - 全部仅通过 `updateNodePosition` 写冷表 `layouts/`，严禁触碰 `machines` 语义或 `llmanspec/specs/`。
- **只读视觉快照导出**（`apps/studio/src/ergonomics/exportSnapshot.ts`）：
  - 引入离线可装依赖 `html-to-image@1.11.13`（`@xyflow/react` 推荐方案，HTML 节点 + SVG 边同屏保真）；
  - 支持 `SVG` 与高清 `2x PNG` 导出，适配 `linear`（`#f5f6f8`）与 `washi`（`#f9f8f4`）两套亮色皮肤底色，提供「整张画布 / 当前选中」与「附带标题栏」轻量选项；不引入 `.canvas`/Excalidraw 双向格式。

## D4 默认缩略视角边框与连线对比度打磨（可量化 WCAG 门禁）

- **纯 WCAG 对比度函数**（`apps/studio/src/ergonomics/contrast.ts`）：导出 `STUDIO_CONTRAST_TOKENS` 与 `contrastRatio(fgHex, bgHex)`，约束两套亮色皮肤下默认转移连线与强边框相对画布背景对比度均 `>= 3.0`（WCAG 2.1 非文本图形可读性基线）。
- **视觉升级**（`apps/studio/src/index.css` + `StateMachineCanvas.tsx`）：
  - `linear`（底 `#f5f6f8`）：默认连线由 `#9aa4b4` 提升至 `#64748b`（对比度 `4.4:1`），强边框 `#8794a8`（`3.0:1`），分组虚线框色值加深且 `1.5px` 清晰抗锯齿；
  - `washi`（底 `#f9f8f4`）：默认连线提升至 `#6b6256`（对比度 `5.6:1`），强边框 `#8c8273`（`3.6:1`）；
  - 卡片与状态节点在默认 50%–75% 缩略视角下边线与箭头清晰可辨，同时保持亮色轻盈克制。

## Open Questions 决议

- 引导向导：按浏览器维度记录完成态，仅 `--demo` 首次在单槽小贴士内提供一键入口。
- 导出选项：在 `画布` 设置面板内提供「整张画布 / 当前选中」与「附带标题栏」两项开关 + SVG/PNG 双按钮。
