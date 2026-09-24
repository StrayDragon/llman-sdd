# Design: 文档事实纠偏与 QA 门禁接线统一

> **人读摘要**
> - **结论**:`llmanspec/AGENTS.md` 有 7 处与代码/specs 矛盾或失真,根 `AGENTS.md`/README 有 2 处门禁描述失真;三条门禁(golden/pending/schema)在 `just qa`、CI、pre-commit 三处接线各不相同。统一为「`just qa` = CI = 全集」。
> - **风险**:① 文档改写须只陈述现状与定案,不预告第二波计划;② `quality-gates.ts` 加严后,任何人改 justfile/CI 都要同步三处。
> - **待决策**:无。

---

## 1. 问题清单(证据)

| # | 位置 | 现文 | 事实 |
|---|---|---|---|
| D-1 | `llmanspec/AGENTS.md:15` | `v1 契约参考(只读,禁止修改):../llman/crates/llman-sdd` | 该路径不存在;v1 源码在 `../llman.old-rs-impl-sdd/crates/llman-sdd` |
| D-2 | `llmanspec/AGENTS.md:13-14` | `SDD 流水线当前由 Rust llman 0.0.x 承载,发布切换后由本工具自身承载` | `changes/archive/2026-09-17-release-v2-and-cutover` 已归档;`.agents/skills/` 由本工具 `init --update` 渲染 |
| D-3 | `llmanspec/AGENTS.md:18-19` | `进度:Phase 0–7(…)已归档` | 过程性叙述,违背根 AGENTS「过程性结论不落独立文档」;活跃 change 以 `llman-sdd list` 为准即可 |
| D-4 | `llmanspec/AGENTS.md:37` 与 `:47` | `移除:…、worktree 并行 change、…` / `worktree 并行…维持移除` | r68(`change start --worktree`)/r69(finalize/archive worktree 感知)为现行合约;同文件 `:94-101` worktrunk 规约使用 worktree |
| D-5 | `llmanspec/AGENTS.md:37,47` | `checkpoint/delta 兼容桩`;`相关调用固化为报错+指引,r53`;`不移植…show --output deltas/reqs-only` | CLI 无 stub(`change checkpoint` → `error: unknown command 'checkpoint'`);r53 是 show 修饰符合约且 CLI 注册了这些 token;定案:已移除命令/选项彻底删除不留 stub |
| D-6 | `llmanspec/AGENTS.md:80` | `Gherkin→bun:test runner(tests/bdd/,~200 行…)` | `tests/bdd/runner.ts` 270 行 |
| D-7 | `llmanspec/AGENTS.md:98` | `→ 回 main worktree llman-sdd change finalize <id>` | r15:finalize MUST 在 binding.branch 执行;r69:目标分支被干净 worktree 持有时在该 worktree 内完成合并 |
| D-8 | `llmanspec/AGENTS.md:101` | `门禁:worktree 内 just qa + just pending-gate + just golden` | 统一后 `just qa` 即全集 |
| D-9 | `AGENTS.md:20` | `just golden(golden 四门)` | `justfile:59-60` 仅 `golden:check` 一门(zh-Hans + en 两套基线) |
| D-10 | `README.md:21,25-31` | `just qa # 静态门禁 + 全部测试(等价 CI)`;门禁表三行 | CI 另跑 golden;pending/schema 不在 CI;门禁表缺两项 |
| D-11 | `justfile:28-30`、`package.json` `qa`、`.github/workflows/ci.yml:31-39` | qa = check + test;CI = check + test + golden | 三处集合不一 |
| D-12 | `tests/bdd/steps/init.ts:97-131` | 只比对 `tests/golden/baseline/skills` | en 基线 `skills-en` 不在 BDD 覆盖内 |
| D-13 | `llmanspec/specs/monorepo-structure.feature:3` | purpose「作为后续全部 port-* change 的可验证地基」 | port-* 已全部归档 |

## 2. 决策

### D1 门禁集合 SSOT

- 集合定义(顺序即执行顺序):`typecheck` → `lint` → `format:check` → `test` → `golden:check` → `pending-gate` → `check:schema`。
- `package.json`:新增 `"pending-gate": "bun scripts/pending-gate.ts"`;`"qa": "bun run check && bun run test && bun run golden:check && bun run pending-gate && bun run check:schema"`。
- `justfile`:`qa: check` 之后逐行执行 test / golden / pending / schema,每步沿用 L0 规则一行 `[pass] <name>`;`pending-gate` recipe 改为 `bun run pending-gate`;删除「等价 CI」之外的冗余注释。各步 MUST 使用工具原生安静开关(`bun run --silent`);三个脚本门成功时已各自只输出一行摘要(2026-09-24 实测),无需改脚本,不得以管道过滤。
- CI `test` job:在 `golden:check` 之后追加 `bun run pending-gate` 与 `bun run check:schema`。
- `quality-gates.ts`(r2 可执行验收)新增断言:① justfile `qa` recipe 体含 `golden:check`、`pending-gate`、`check:schema` 三个调用;② `package.json` `qa` 等于上文字符串;③ `ci.yml` 的 `run:` 步覆盖全集:`bun run typecheck`、`bun run lint`、`bun run format:check`、`bun test tests/`、`bun run golden:check`、`bun run pending-gate`、`bun run check:schema`(review 时补齐:最初只断言后三项,与 r2「CI 运行同一集合」不符)。保留原有断言。

### D2 golden 双 locale BDD

- `tests/bdd/steps/init.ts`:新增 Given「本仓库的等价 config(en 与 bdd 配置)」;Then「与 golden en 基线归一化版本号后 diff 为空」;比对逻辑改为 import `tests/golden/lib.ts` 的归一化与树比对函数(只读复用,不修改 lib.ts;若 lib.ts 未导出所需函数,则在 init.ts 内保留现有 readTree 实现并参数化基线目录,不新增导出)。
- zh-Hans 既有场景保持;两个场景的 Then 对「文件缺失」「文件多余」「内容不同」三类差异分别给出含文件名的错误。

### D3 `llmanspec/AGENTS.md` 改写规则

- 只改托管块(`LLMANSPEC:START/END`)**之外**的内容;托管块由 `init --update` 管理。
- 逐条对应 D-1…D-8 修正;措辞只陈述现状与定案,不预告未来 change、不写 rN 以外的过程叙述。关键新文本:
  - 项目定位:「本仓库以 llman-sdd 自托管 SDD 流水线(狗粮模式)。v1 契约参考(只读):`../llman.old-rs-impl-sdd/crates/llman-sdd`。活跃 change 以 `llman-sdd list` 为准。」
  - 范围决策「移除」行:`project import`(OpenSpec 互导)、`change checkpoint`/`change delta` 及其兼容桩、rust-i18n;**已移除的命令与选项彻底删除,不保留报错 stub**(调用得到 CLI 的 unknown command/option 错误)。
  - 范围决策新增:「worktree:v1 的并行 change 机制不移植;v2 支持单 change 单 worktree——`change start --worktree`(r68)与 finalize/archive 的目标 worktree 感知(r69)」。
  - 删除「`show --output deltas/reqs-only` 不移植」子句(与 r53 冲突;show 修饰符去留以 peripheral-commands.feature 为准)。
  - BDD 条:删除行数描述。
  - worktrunk 生命周期:`… → 在 change worktree 内完成 Specs landing / 实施 / 门禁 → 在 change worktree 内执行 llman-sdd change finalize <id>(目标分支由 main worktree 持有且干净时,finalize 在 main worktree 内完成合并、SSOT 改名与归档提交)→ wt remove`;门禁行改为 `worktree 内 just qa`。
- 根 `AGENTS.md`「项目速览」(托管块外):`just qa`(静态门禁 + 全部测试 + golden + pending + schema;等价 CI)、`just golden`(skills 渲染基线门,zh-Hans + en)。
- `README.md`:常用命令与 QA 门禁表与 D1 集合一致(新增 pending-gate、check:schema 两行);「等价 CI」保留且此后为真。

### D4 规格改写要点

- monorepo-structure r2:qa 聚合门禁 MUST 为 check + test + golden:check + pending-gate + check:schema;package.json `qa` 脚本 MUST 与之同集合;CI MUST 运行同一集合;pre-commit 要求不变。
- monorepo-structure r3:追加「core 内对进程环境(`process.*`)与墙钟(无参 `Date`)的读取同属副作用,MUST 经注入;纯度门禁 MUST 检出此类读取(过渡白名单须逐项注明清零责任方)」。
- init-generators r19:「渲染产物与 golden 基线的归一化比对 MUST 覆盖 zh-Hans 与 en 两个 locale」;新增 en `@executable` 场景。

## 3. 非目标

- 不改模板、不改 CHANGELOG(协调者在 finalize 时登记)、不删仓库根空 `src/`(空目录不入 git;根因是 `spec skeleton` 的 `mkdirp('src/')`,归第二波)。
- 不整合测试 helper(与第一波其他 change 的步骤文件相交,归第二波)。
- 不处理 r67/r70/r72「以 exit 0 包装单测」的元场景形态(有意的发现锁,保持)。

## 4. 风险

| 风险 | 缓解 |
|---|---|
| 第一波其他 change 合入后使 golden/schema/pending 失败,而 D 先合入导致 main 上 `just qa` 变红 | 合并顺序无关:D 只是把已存在的门纳入 qa;其他 change 自身的 T 门禁已要求这三门全绿 |
| 文档改写引入新的不实陈述 | T3 要求每条改写附「事实依据」(文件路径或命令输出)写在任务注释 |

## 5. 第一波协作约束

**req id 号段**:本变更 r85–r89(本次 Specs landing 未新增 rN)。

**文件所有权**(第一波内独占):`AGENTS.md`(托管块外)、`llmanspec/AGENTS.md`(托管块外)、`README.md`、`justfile`、`package.json`(仅 `scripts` 字段)、`.github/workflows/ci.yml`、`tests/bdd/assert/{quality-gates,monorepo-layout}.ts`、`tests/bdd/steps/init.ts`、`llmanspec/specs/{monorepo-structure,init-generators}.feature`。

**禁止触碰**:`packages/**`、`apps/**`、`scripts/**`(`scripts/gen-schema.ts` 归 harden-core-purity-config)、`tests/golden/**`、`llmanspec/config.yaml`、其他 specs。
