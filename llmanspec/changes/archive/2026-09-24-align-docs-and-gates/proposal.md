---
depends_on: []
needs_specs_change: true
branch: sdd/align-docs-and-gates
base_branch: main
base_sha: e16d51b928c1ccb837ddbc7373650456cad41067
---

# 文档事实纠偏与 QA 门禁接线统一

## Why

2026-09-24 全仓审计发现,项目的「规则文档」本身与代码、specs 和彼此之间存在多处矛盾,而 agent 以 `AGENTS.md` 为最高优先上下文——文档错,agent 就会按错的规则行事:

- `llmanspec/AGENTS.md` 称「移除:worktree 并行 change」「worktree 并行…维持移除」,但 change-lifecycle r68/r69、CLI `change start --worktree`、同文件的「并行开发(worktrunk)规约」都在使用 worktree。
- 同文件称「SDD 流水线当前由 Rust llman 0.0.x 承载」,而 `release-v2-and-cutover` 已归档、仓库已自托管;v1 契约参考路径 `../llman/crates/llman-sdd` 已不存在(实际在 `../llman.old-rs-impl-sdd/crates/llman-sdd`)。
- 同文件称 checkpoint/delta「相关调用固化为报错+指引(r53)」:代码中不存在任何 stub,实际报 commander 的 `unknown command`;r53 是 show 输出修饰符,引用错位;又称 `show --output deltas/reqs-only`「不移植」,而 r53 规定它们存在且 CLI 已注册。用户已定案:已移除命令/选项**彻底删除、不留 stub**。
- worktrunk 生命周期写「回 main worktree 执行 `change finalize`」,与 r15「finalize MUST 在 binding.branch 上执行」冲突(正确路径是在 change worktree 内执行,由 r69 在持有目标分支的 main worktree 内完成合并)。
- BDD runner「~200 行」已失真(`tests/bdd/runner.ts` 270 行)。
- 根 `AGENTS.md` 称 `just golden`「golden 四门」,justfile 只有一个 `golden:check`;README 称 `just qa`「等价 CI」,实际:CI 跑 golden 而 `just qa` 不跑;`pending-gate` 与 `check:schema` 既不在 CI 也不在 `just qa`(后者只在 pre-commit),而 AGENTS 要求 worktree 内跑 `just qa + just pending-gate + just golden`。

门禁层面还有一个盲区:BDD r19 的 golden Then 只比对 zh-Hans 基线(`tests/golden/baseline/skills`),en 基线(`skills-en`)只在 `golden:check` 脚本里比对,而该脚本不在 `just qa`。

## What Changes

Specs landing:`llmanspec/specs/monorepo-structure.feature`、`llmanspec/specs/init-generators.feature`。

1. **门禁统一(r2 改写)**:`just qa` 与 `package.json` 的 `qa` 脚本 MUST 聚合 check + test + golden:check + pending-gate + check:schema;CI MUST 运行同一集合;`quality-gates.ts` 断言三处(justfile / package.json / ci.yml)一致。
2. **纯度条款补全(r3 改写)**:core 内进程环境(`process.*`)与墙钟读取同属副作用,MUST 经注入(门禁实现由并行的 harden-core-purity-config 承担)。
3. **golden 双 locale(r19 改写)**:渲染验收 MUST 覆盖 zh-Hans 与 en 两个基线;新增 en 可执行场景,BDD 步骤复用 `tests/golden/lib.ts` 的归一化与比对。
4. **文档事实纠偏**:`llmanspec/AGENTS.md`(托管块外)逐条修正上述矛盾与失真;根 `AGENTS.md` 项目速览与 `README.md` 门禁表与新门禁集合一致。
5. monorepo-structure 的 purpose 去掉「后续全部 port-* change」的过期叙述;scope 补 `.github/workflows/`、`scripts/`。

## Capabilities

- monorepo-structure(r2、r3 改写;purpose/scope 更新)
- init-generators(r19 改写与 en 验收)

## Impact

- `just qa` 增加三个快速门(本地实测合计 < 1s);CI test job 增加 pending-gate 与 check:schema 两步。
- 文档类改动不影响运行时行为;golden 基线不变(本变更不改模板)。
- 本变更属第一波,与 fix-lifecycle-validation-defects、harden-core-purity-config 并行;文件所有权与 req 号段见 design.md §5。
