---
depends_on: []
---

# Bootstrap:Bun/TS 重写地基与工程契约(Phase 0+1)

## Why

`../llman`(Rust)中的 llman-sdd 子系统要迁移为 TypeScript + Bun 实现,以支撑后续网页交互类功能(届时再引入 rsbuild/web)。本 change 是重写序列的第一个:搭好 monorepo 脚手架、移植 BDD runner、建立 golden 验收基线,并把「工程结构与工具链门禁」落为 live specs,为后续 6 个 port-* change 提供可验证地基。选型与范围已定案,见 `llmanspec/AGENTS.md` 与 `design.md`。

## What Changes

- 新建 Bun workspaces 单仓骨架:`packages/core`(纯域逻辑)、`apps/cli`(commander 入口);`apps/web` 仅预留不创建;`.bun-version` 钉版,`bun.lock` 入库
- 工具链门禁:oxlint + oxfmt(配置基线对齐 `../crystalith`)、tsc --noEmit、prek hooks(oxlint / oxfmt --write / whitespace 系)、justfile(`check` / `qa` / `test` / `build` / `lint:fix`)
- 移植 `../crystalith/apps/server/tests/bdd/` 的 Gherkin→bun:test 桥接 runner(约 200 行,原生支持 zh-CN 关键字)至 `tests/bdd/`,打通 `bdd.run_command: bun test tests/bdd`
- 建立 `tests/golden/` 基线:用 v1(Rust llman 0.0.77)在等价 config(locale zh-Hans + bdd-on)下渲染的 skills 生成物,与样例项目的 validate/list/show 输出样本
- `apps/cli/scripts/build-binary.ts`:`Bun.build({ compile })` 单二进制骨架,版本号从 git tag 注入

## Capabilities

- `monorepo-structure`(Specs landing:布局 / 门禁 / core 纪律 / BDD runner 就绪)

## Impact

- 纯新增工程文件,不改任何既有行为;`.agents/`、`AGENTS.md`、`llmanspec/` 仍由 v1 llman 管理,不受影响
- 后续全部 port-* change 均 depends_on 本 change;不影响 v1 工具在本仓库的继续使用
