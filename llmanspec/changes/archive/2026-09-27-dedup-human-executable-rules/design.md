# 去 human 整理——引擎模型设计

## 1. 目标模型（与决策 #0 路线 H 对齐）

现行强制「规则只能是 `@human`」。目标模型引入显式规则标记 `@rule`，使规则的**角色**与**可执行性**正交：

| 场景形态 | 角色 | 是否被 BDD runner 执行 | 语义 |
|---|---|---|---|
| `@req:<id> @executable` | 验收/可执行行为（**默认首选**） | 是 | `假如/当/那么` 步骤绑定 BDD 步骤代码；至少一个 `@req` 挂回规则。经典 gherkin 形态。 |
| `@req:<id> @rule` | 规则（可自动化锚点） | 否 | statement 全文放描述；MUST 挂 `@executable` 验收，否则判 ERROR。用于暂不转写 executable 的需求。 |
| `@req:<id> @rule @human` | 规则（治理/人工约束） | 否 | statement 须含 MUST/SHALL；无法自动判定（eval r84/r85）。 |

- **`@rule` 与 `@executable` 互斥**（同场景判 ERROR）；`@human` 与 `@executable` 互斥不变。
- 每 capability 至少 1 条规则：`@human` 或 `@rule`（原「至少 1 条 `@human`」泛化）。
- `@req` 悬空判定：验收的 `@req` 必须命中规则（`@human` 或 `@rule`）的 req id。
- `@rule` 可自动化规则（非 `@human`）若 0 步骤且 0 链接验收 → **ERROR**（宣称可自动化必须有所守护；推动转写 executable）。
- `@manual` 迁移 ERROR 不变；`@req` 全局唯一注册表不变。
- 撰写引导（模板 r66 与再次修订的 propose/verify/apply/validation-hints/feature-contract）**优先 executable、尽可能减少 @rule 定义**，并以示例说明何时用 executable 何时用 rule。

### 为什么「链接验收承载」而非「规则自带全部步骤」（设计取舍，已在提案中声明）

按用户 2026-09-27 决策（互斥模型）：规则（`@rule`/`@rule @human`）与验收（`@executable`）是两个互斥角色，规则不自带 `@executable`，由链接的 `@executable` 验收场景承担全部自动判定（步骤锚定、`bun test tests/bdd` 全绿）。引擎不要求把既有验收并入规则场景，避免步骤拼接的 fixture 串扰与粒度丢失；模板引导向 executable 迁移、最小化规则定义。

## 2. 引擎改动点（全部向后兼容）

1. `packages/core/src/spec/parser.ts`：
   - 解析 `@rule` tag → `ScenarioIR.rule` 布尔（缺省 false）。
   - `@human` 隐式设置 `rule=true`（旧文档零改动继续有效，`@human` 语义收敛为治理约束）。
   - 新增互斥结构错误：`@rule` 与 `@executable` 同场景判 ERROR（`tag:rule-exec-exclusive`）；`@human` 与 `@executable` 互斥沿用；规则场景必须携带 `@req`。
2. `packages/core/src/validation/validate.ts`：
   - `human.length === 0` 的 ERROR 改为 `rules.length === 0`（rules = human ∪ ruleExecutable）。
   - 悬空 `@req`：`ruleReqIds` 由 `human` 扩展为 `rules`。
   - `@rule` 可自动化规则（非 `@human`）且 `stepCount === 0` 且无链接验收 → ERROR（automatable rule is not guarded）。
   - pending INFO 口径：规则（任意分类）无链接验收 → INFO（保留，供治理类规则书面理由）。
3. `packages/core/src/review/`：pending/unbound 信号迁移到新 rule set（unbound 仍指无 `@req` 的验收；pending 指规则无验收）。
4. `tests/bdd/runner.ts`：`onlyTagged: '@executable'` 过滤追加 `!(scenario.rule && stepCount === 0)`——锚点不注册。
5. `list --specs --json` morphology：`ruleCount` 保持「规则数」语义（覆盖 `@human`/`@rule`），实现为计数函数更新（如按 rule 标志）。
6. authoring（`spec add-req`/`add-scenario`）不变：add-req 仍写 `@req:<id> @human`（作者按需改 `@rule`/`@rule @human`；add-req 是治理起步的保守默认）。

## 3. specs 转换清单（13 文件，85 → `@rule`，2 → `@rule @human`）

按 capability（triage 分类见 `docs/research/dedup-human-triage-plan.md` §3）：全部 A/A+ 规则的标签改为 `@req:<id> @rule`；A+ 同时补验收；仅 eval-playbook r84/r85 改为 `@req:<id> @rule @human`。转换后 `@human` 仅剩 2 条；`@rule` 85 条；验收总数不变（+新增补验收）。`@rule` 与 `@executable` 互斥，规则场景不携带 `@executable`。

## 4. 验收补足设计（A+ 15 条）

每处补验收的场景名、GIVEN 断言点与步骤定义落点（tests/bdd/steps/*.ts）：

| capability | req | 处置（完成状态） |
|---|---|---|
| change-lifecycle | r14 | ✅ 已补：「start 在非默认分支被拒」场景 + 步骤（lifecycle.ts） |
| change-lifecycle | r44 | ✅ 已补：「attach 显式 base 校验」场景 + 步骤（不存在/等于当前分支） |
| change-lifecycle | r68 | ⚠️ 记录：回滚为防御性路径（worktree 内不可能缺已提交 proposal 的正常流），主路径已由 r68 验收覆盖；proposal 缺失回滚逻辑存在（lifecycle.ts:188-197）但未单列验收 |
| change-lifecycle | r69 | ✅ 共享路径覆盖：archive 与 finalize 共用 `mergeRenameCommit`（含 worktree 感知,lifecycle.ts:348-413）;r69 finalize 三态验收守护该共享路径 + r39 archive 自家验收;不重复建场景 |
| peripheral-commands | r30 | ✅ 已补：「块式依赖与畸形 frontmatter 不中断」场景 + 步骤（peripheral.ts） |
| peripheral-commands | r61 | ✅ 既有覆盖确认：tests/unit/resolve.test.ts 已覆盖「多前缀列候选」「大小写敏感」;spec 优先的跨面由 CLI 消歧验收守护;无新增 |
| context-index | r26 | ✅ 既有覆盖确认：tests/unit/context.test.ts 已覆盖锁 pid/时钟注入与陈旧锁清理（LOCK_MAX_AGE_MS）;无新增 |
| context-index | r27 | ⚠️ 记录：工具三件套名与轮上限核心由 r29 mock 验收 + context 单测间接覆盖;完整工具名面未单列验收 |
| context-index | r57 | ✅ 已补：「backend 取值优先级」场景 + 步骤（CLI 覆写 env） |
| review-freeze | r23 | ✅ 已补：「export-html 产出自包含报告」场景 + 步骤 |
| review-freeze | r24 | ✅ 已补单测：7z add 失败回滚（tests/unit/archive.test.ts,注入失败 7z stub） |
| review-freeze | r25 | ✅ 已补：「thaw 未知名报错并列出可用条目」场景 + 步骤;legacy 条目回置由既有 r25 回置验收 + 单测覆盖 |
| eval-playbook | r82 | ⚠️ 记录（自洽理由）:r82 自身规定 eval 不进 qa——在 qa 里自动断言 eval/run.ts 的 die 与「非 skip」语义与规则自相矛盾;die 路径实现已核（eval/run.ts:9-15,48-54,393+）;验收维持「qa 不启动 harbor」既有断言 |
| eval-playbook | r83 | ⚠️ 记录:eval-groups-schema 单测守护 groups 文档 schema;n<3 insufficient 与 worktree 缺省属 eval/run.ts 外部语义(不进 qa);维持既有 |
| eval-playbook | r86 | ⚠️ 记录:eval-groups-schema 单测守护 models.json 相关契约(不进 qa);维持既有 |

## 5. 缺口 G1 修复设计

- spec 语义维持「跳过符号链接」；实现把 `NextIdIo.isDirectory` 的构造点改为不跟随符号链接：`lstatSync(p).isDirectory()`（或 `statSync(p, { throwIfNoEntry: false })` 判断 `SymbolicLink`）。改 `apps/cli/src/commands/change.ts` 与 `apps/cli/src/io.ts` 两处构造点（core 纯域逻辑本身只依赖注入接口，不动）。
- 补单测（packages 或 tests/unit）：符号链接目录名含 `c<N>` 不得计入 next-id；普通目录仍计入。
- 补 BDD 验收（change-lifecycle r35）场景 + 锚定步骤。
- 注意：core 纯度纪律（monorepo r3）要求 FS 副作用经接口注入——symbolic-link 判定由 CLI 注入端（io.ts/change.ts）实现，core 不变，不违反纯度门禁。

## 6. 模板同步清单（阶段 2 强制）

- `packages/core/templates/{zh-Hans,en}/skills/llman-sdd-propose.md`：单轨/tag 语法节改为 `@rule` 互斥模型并优先 executable（`@rule`/`@rule @human` 规则 + `@executable` 验收互斥；撰写引导优先 executable、减少 rule、附示例）。
- `…/llman-sdd-verify.md`：合约轴审查措辞「@human 规则与 @executable GWT」→「@rule/@rule @human 规则与 @executable GWT」。
- `…/llman-sdd-apply.md`：「规则 `@human`、验收 `@executable`」→ 补 `@rule` 说明。
- `…/units/skills/validation-hints.md`：2）tag 语法节按新模型改写（zh/en 双语）。
- `…/units/spec/feature-contract.md`：@human/@executable 说明补 @rule 一段（双语）。
- init-generators r66「分流判据」措辞保持主条款不变（其语义已覆盖新模型）；r70「指引语义对齐」单测可能引用文案关键词——需比对 `tests/unit/template-guidance-parity.test.ts` 的必含标记（若引用了「规则 `@human`」「@req:<id> @human」等字样则同步改）。
- 收尾：`bun apps/cli/src/main.ts init --update` + `bun run generate:skills-template-baseline` + `bun run check:skills-template-render`，提交 `.agents/skills` 与 golden 基线。

## 7. 风险与对策

- **引擎改动回归**：全部向后兼容 + 既有单测保持绿 + 新增覆盖新语义的单测；BDD smoke 不受影响。
- **specs 大批量标签替换**：机械替换后跑 `bun test tests/bdd` 与 `validate --specs --strict`，若 runner 因锚点产生惊扰由 runner 短路处理（第 2.4 条）。
- **模板必含标记漂移**：`template-guidance-parity.test.ts` 与 `template-command-parity.test.ts` 若引用被改字样会直接红——以红为准修模板或修断言，渲染门（golden/check）必须最终过。
- **验收补足影响 BDD 步骤锚定**：新场景用既有步骤模式或新增步骤，逐 capability 跑 `bun test tests/bdd` 确认全绿。
