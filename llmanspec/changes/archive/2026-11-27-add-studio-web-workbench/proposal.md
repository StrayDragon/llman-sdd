---
depends_on:
  - add-studio-domain-core
title: "[MVP] 落地 Studio Web 自举交互工作台、方言引擎与实时依赖图视图"
branch: sdd/add-studio-web-workbench
base_branch: main
base_sha: 7e85d030467d1b785f86f624407a9332850cf545
---

# 落地 Studio Web 单状态机交互工作台与实时依赖图视图

## Why

人类在纯文本 `.feature` 表格和命令行 Mermaid 输出上难以高效把握复杂状态流转与多 change 依赖关系。需要一个本地运行、低认知负担的 Web 控制面，让人类通过直观的拖拽改图、红绿语义 Diff、图元评论、单步试跑与实时依赖图审视来主导业务意图演进，而不是陷入具体实现代码或满屏杂乱控件。

## What Changes

- **Web 工程底座（`apps/studio/`）**：按 `llmanspec/AGENTS.md` 约定使用 `rsbuild` + React + TypeScript，采用现代低认知负担前端架构（Zustand + `zundo` 单一状态库、TS 判别联合类型约束 5 态 UI、坐标与领域数据冷热拆表、3 层防丢态自动保存、Tailwind CSS v4 + 无头原语 + 共享 `SearchProvider` 的 `⌘K` 与 `+ 新标签页` 并预留 RAG 语义检索槽位）。
- **自举 3 层 `studio-web` 模型、统一 `@xyflow/react` 底座与混合规格容器**：`studio-web` 作为首个全面拥抱本系统的自举规范样例（3 层盒中盒嵌套状态机，0 错 0 警），同时完整支撑状态机 / 流程图 / 决策树与真值表（0-LLM 确定性双视图）/ 规则文档 4 类规格闭环（兼容单个 `.feature` 同时含决策表与数十条规则的混合容器，0 状态表仓库默认提供友好空态引导与 `--demo` 内置自举样例）；全站交互节点图统一基于 `@xyflow/react` + `elkjs` 避障通道路由与手拖坐标独立持久化，配备双层多叉「世界线」（Git 分支/Worktree + 非破坏 `parentId`/`actor` 微树）与真实画布 1:1 实时叠加对比、时间线净 Diff 语义对冲消元及子树脏状态冒泡。
- **人类优先交互、6 条设计真言与全站统一就近评论浮窗**：Web 界面 100% 面向人类交互，固化 **6 条可机检设计真言**（触点同侧展开、顶栏浮层单槽互斥、默认连线零穿卡、连线与标签互斥且支持手拖微调、领域分组排他隔离、产品级单色 SVG 零 Emoji 与零“预留/Demo”占位文案）；坚持做减法（2 套亮色皮肤、3 种连线、2 个界面开关、可选 TextFold 外部服务收口于设置，无左侧竖条工具栏与缩放自动变密度）；严格区分 Hover / Left-Click / Right-Click；5 类对象（主视图卡片、主视图连线、状态/步骤节点、下钻连线、规则/决策文档）共享统一可拖拽就近评论浮窗（`右键 → 留评论` 或点 `(N)` 角标唤起）；配套方言隔离 Linter、验证硬度分级（`仅文档 / 已绑测试 / 防漂移 / 形式化`）、Scheme C 统一草稿保存分流、全产品零盲复制「生成调整 Prompt」预编辑工作台以及底栏「保存变更」分支写保护三出口向导。
- **实时 `llman-sdd graph`「变更依赖」侧栏视图**：在 Studio 内提供只读、可拖拽、可独占全屏的实时「变更依赖」视图（自动反映 `llmanspec/changes/` 下的 `depends_on` 变更），采用 MIT 开源零运行时依赖的 **`obsidianmd/pele`** 直接同步渲染 Mermaid SVG 并适配 2 套亮色皮肤。
- **本地按需单实例 Hub、Zod 端到端契约与单二进制共同分发**：`llman-sdd studio open / serve --foreground / stop` 基于纯 Web 标准的 **`Hono` + `@hono/node-server`**（遵守 Bun/Node 双运行时门禁）启动本地回环服务（`127.0.0.1`），新增 `packages/core/src/studio/contracts.ts` 作为前后端唯一 Zod v4 契约 SSOT；复用 `discoverRoots()` 实现多仓 / 多 Worktree / 子项目 `llmanspec/` 隔离；`/p/:wsKey/*` Deep-Link 原生支持透明 HTTP `GET` 内容协商（浏览器返回 SPA + 内嵌 `<script id="studio-focus-context">`，非浏览器 Agent `fetch`/`curl` 默认返回精简 Markdown + `?format=json` 路由提示）；`build-binary.ts` 编译期自动内嵌 `apps/studio/dist/`，实现单个可执行文件共同分发 CLI 与 Studio Web。

## Capabilities

- `studio-web`（新增，待 propose 阶段建 spec）：定义单状态机画布、5 态交互、红绿 Diff、锚定评论、`--demo` 空态、Change 依赖 DAG 实时视图与导出行为。
- `monorepo-structure`：按 `llmanspec/AGENTS.md` 正式纳管 `apps/studio`（rsbuild）至 monorepo 门禁。

## Impact

- 依赖 `add-studio-domain-core` 的纯域图 IR、语义 Diff 与会话格式。
- 刻意将“多 Tab 业务森林 + 宏观星图下钻”拆至后续 `add-studio-forest-tabs`，保证首版工作台聚焦且体验地道。

## Open Questions

全部核心决策已收敛并写入同目录 [design.md](./design.md)：

- **前端主技术栈**：锁定 `@xyflow/react` + `elkjs` + `zustand`/`zundo` + Tailwind CSS v4 + `cmdk`（全 MIT）；只读 Mermaid 实时渲染（`llman-sdd graph` Change 依赖 DAG 及提案内嵌 Mermaid 图）采用 **`obsidianmd/pele`（MIT，零运行时依赖）**；后续广义 Mermaid 流程图的可视化双向编辑锁定 **`inkeep/visimer`（`@visimer/react`，SVG → CST 无损双向同步）** 作为首选集成方案，C3 前端视图层预留对应 `CanvasAdapter` 插槽。
- **静态托管、HTTP 底座与单文件分发**：`rsbuild build` 产出静态 `apps/studio/dist/`，由 `apps/cli` 基于 **`Hono` + `@hono/node-server`**（纯 Web Standard API，100% 过双运行时门禁）统一托管静态资源 + `/api/*`（共享 `packages/core/src/studio/contracts.ts` Zod v4 校验）+ SSE（`streamSSE`）；`apps/cli/scripts/build-binary.ts` 通过编译期 `define` 表内嵌 `apps/studio/dist/`，使 `bun build --compile` 产出的单可执行文件开箱自带完整 Studio Web，源码/npm 态自动回退磁盘读取；开发期用 `rsbuild dev` 代理 `/api/*`。
- **单步试跑态（`Simulate`）驱动**：在 `apps/studio` 前端引入 `xstate` 运行时与原生 `inspect` API（不回流污染 `packages/core` 依赖），将 `StudioMachineIR` 编译为可交互 actor，配合守卫真假开关单步试跑并记录微步轨迹，为后续嵌套父状态/并行区留好演进底座。
- *实施期冒烟项*：安装 `obsidianmd/pele` 时现场确认其具体 npm 包导出形态与 `llman-sdd graph` 输出兼容性（写入 T5 验收标准）。
