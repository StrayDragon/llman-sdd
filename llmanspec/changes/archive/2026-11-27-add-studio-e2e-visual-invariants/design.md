# Design: Studio 真实浏览器 E2E 视觉不变量门禁

## D1 两层判定：纯几何判定器 + 真实浏览器采集

- **纯几何判定器**（`tests/e2e/studio/invariants.ts`，零浏览器依赖）：输入矩形、折线采样点与可见文本，输出违规清单。覆盖 6 条设计真言：抽屉同侧且不压小地图、顶栏中轴槽可见浮条数 `<= 1`、连线零穿非端点卡片、标签两两零重叠、分组包围盒零误包非成员、可见文案零彩色 Emoji 与零开发态占位词。
- **真实浏览器采集**（`tests/e2e/studio/run.ts`）：用 `playwright-core` 驱动无头 Chromium，从 DOM/SVG 采集几何与文本后喂给判定器。
- BDD 场景只绑定纯判定器（构造违规与干净两组几何，断言判定准确），保证日常 `bun test` 秒级且不依赖浏览器；真实浏览器门禁走独立 recipe。

## D2 依赖与离线可装

- 精确锁定 `playwright-core@1.61.1`（devDependency），对应本机已安装的 `chromium-1228`；不引入 `@playwright/test` 运行器，避免与 `bun test` 双运行器。
- 浏览器缺失时 `run.ts` 以退出码 2 失败并打印安装提示（`bunx playwright-core install chromium`），不静默跳过。
- 普通 CLI 用户零影响：依赖仅在根 devDependencies，单二进制不打包。

## D3 隔离与夹具

- 进程内 `startStudioHub({ initialDirectory: <tmp>, port: 0, writeHubFile: false, studioDistDir: apps/studio/dist })`：不写 `~/.llman-sdd/studio-hub.json`，不与用户正在运行的 Hub 抢端口。
- 夹具：`mkdtemp` 建临时 git 仓，复制本仓 `llmanspec/`（含全部真实规格，数量动态），`git init && commit` 以获得合法 wsKey；跨工作区回归再建第二个临时仓。所有 `.llman-sdd/studio/` 写入只发生在临时仓。
- 关键视口：`1440×900` 与 `1280×800` 各跑一遍；失败时截图落 `.llman-sdd/e2e-artifacts/`（已被 `.gitignore` 忽略）。

## D4 DOM 钩子

前端补最小 `data-testid`：`worldline-drawer`、`top-slot-*`（小贴士/对比条/诊断条）、`spec-card`（宏观卡片）、`edge-label`；小地图、节点、边路径复用 `@xyflow/react` 既有类名（`.react-flow__minimap`、`.react-flow__node`、`.react-flow__edge-path`）。分组框复用 `.group-frame`。

## D5 近期回归断言组

锁定会话中用户报过的回归：拖拽节点零 `pageerror`（React #185）、小地图含节点预览、浏览器原生右键被禁用（`contextmenu` 默认被阻止）、新标签页不显示小贴士、跨工作区切换与刷新后改动不丢失（`flushPendingSaves`）。

## D6 发现即处置

首次跑出的真实违规：能在本 change 内修复的当场修（视为 E2E 的直接收益）；确属结构性、需独立设计的，不放宽断言，改为在 `run.ts` 的显式已知豁免表登记（带原因与后续 change 归属），豁免表为空是长期目标。

## Open Questions 决议

- 浏览器依赖：按 D2 精确锁定 devDependency，不进 `just qa`。
- 关键视口：两档都跑，失败保存截图。
