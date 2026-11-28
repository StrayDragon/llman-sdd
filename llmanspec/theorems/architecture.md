---
title: "llman-sdd 核心架构人类定理"
owner: human
---

## theorem:core-zero-io — 核心域零副作用与零墙钟
- **statement**: `packages/core/src/**` 不得直接导入 `node:*`、读取 `process.*` 或调用无参 `new Date()` / `Date.now()`；所有 I/O 与时钟必须通过接口参数注入。
- **rationale**: 保证纯域算法、解析器与 Studio 契约可在 CLI、单测与浏览器端安全共用且 100% 确定性可测。
- **gate**: `bun test tests/bdd/run.test.ts`
- **scope**: `packages/core/src/**`
- **tags**: architecture, purity, core

## theorem:cli-dual-runtime — CLI 双运行时兼容
- **statement**: `apps/cli/src/**` 不得使用 `Bun.*` API 或 `import.meta.dir`，保持标准 Node.js 与 Bun 双运行时兼容。
- **rationale**: 避免发布到 npm 或非 Bun 运行环境时发生运行时崩溃。
- **gate**: `bun test tests/bdd/run.test.ts`
- **scope**: `apps/cli/src/**`
- **tags**: architecture, runtime, cli

## theorem:studio-production-hygiene — Studio 生产界面六真言与零静默覆写
- **statement**: Studio Web 生产界面严禁出现彩色 Emoji 滥用、`window.prompt()` 或 `[DEMO-SIM]`/预留占位按钮；所有画布与 Agent 协商动作不得在默认分支未经人类确认静默覆盖 `llmanspec/specs/`。
- **rationale**: 守住产品级视觉克制、人类最终裁决权与主干分支规格可信度。
- **gate**: `bun test tests/unit/studio/`
- **scope**: `apps/studio/src/**`
- **tags**: studio, ux, safety
