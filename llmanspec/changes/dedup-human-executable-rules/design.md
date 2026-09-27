# 去 human 整理——引擎模型设计

## 1. 目标模型（与决策 #0 路线 H 对齐）

现行强制「规则只能是 `@human`」。目标模型引入显式规则标记 `@rule`，使规则的**角色**与**可执行性**正交：

| 场景形态 | 角色 | 是否被 BDD runner 执行 | 语义 |
|---|---|---|---|
| `@req:<id> @human` | 规则（治理/人工约束） | 否 | statement 全文放描述，MUST 含 MUST/SHALL；无法自动判定（eval r84/r85）。`@human` 隐式即规则，向后兼容旧文档。 |
| `@req:<id> @rule @executable` | 规则（可自动化） | 是（若自带步骤） | 验收经**链接的 `@executable` 验收场景**承载（GWT 步骤锚定）；规则场景本身可带步骤，无步骤时由链接验收守护。 |
| `@req:<id> @executable`（无 `@rule`） | 验收（链接到规则） | 是 | 至少一个 `@req` 链接到存在的规则；缺省即验收，加 `@rule` 才升为规则。 |

- 每 capability 至少 1 条规则：`@human` 或 `@rule @executable`（原「至少 1 条 `@human`」泛化）。
- `@req` 悬空判定：验收的 `@req` 必须命中规则（`@human` 或 `@rule @executable`）的 req id。
- `@rule @executable` 规则若 0 步骤且 0 链接验收 → **ERROR**（宣称可自动化必须有所守护，pending INFO 升级为硬门）。
- `@human` / `@executable` 互斥不变；`@manual` 迁移 ERROR 不变；`@req` 全局唯一注册表不变。

### 为什么「链接验收承载」而非「规则自带全部步骤」（设计取舍，已在提案中声明）

把规则改写为自带全部 GWT 步骤需把 163 条既有验收的步骤机械拼接进 85 条规则场景并删验收——丢失逐验收场景名/独立作用域，且步骤拼接存在 fixture 串扰风险（前一节的 Given 会覆盖后一节的状态）。现行 163 条 `@executable` 验收已是真实锚定、`bun test tests/bdd` 全绿的可执行守护；因此「转 `@executable`」在实现上 = 规则获得 `@rule @executable` 标签（语义声明可自动化），其判定位全部由链接验收 + BDD 步骤机器守住。规则场景 0 步骤时 runner 跳过，避免「0 步骤场景静默通过」造成虚假测试计数。

## 2. 引擎改动点（全部向后兼容）

1. `packages/core/src/spec/parser.ts`：
   - 解析 `@rule` tag → `ScenarioIR.rule` 布尔（缺省 false）。
   - `@human` 隐式设置 `rule=true`（不新增错误，旧文档零改动继续有效）。
   - 新增结构错误：`@rule` 场景必须且只能带 `@human` 或 `@executable` 之一（都不带 → 报错；都带 → 沿用互斥 ERROR）；`@rule` 不要求 `@req` 之外的东西。
2. `packages/core/src/validation/validate.ts`：
   - `human.length === 0` 的 ERROR 改为 `rules.length === 0`（rules = human ∪ ruleExecutable）。
   - 悬空 `@req`：`ruleReqIds` 由 `human` 扩展为 `rules`。
   - `@rule @executable` 且 `stepCount === 0` 且无链接验收 → ERROR（message 指明`@rule @executable rule must have linked acceptance or steps`）。
   - pending INFO 口径：规则（任意分类）无链接验收 → INFO（保留，供治理类规则书面理由）。
3. `packages/core/src/review/`：pending/unbound 信号迁移到新 rule set（unbound 仍指无 `@req` 的验收；pending 指规则无验收）。
4. `tests/bdd/runner.ts`：`onlyTagged: '@executable'` 过滤追加 `!(scenario.rule && stepCount === 0)`——锚点不注册。
5. `list --specs --json` morphology：`ruleCount` 保持「规则数」语义（现覆盖 `@rule @executable`），实现为计数函数更新（如按 rule 标志）。
6. authoring（`spec add-req`/`add-scenario`）不变：add-req 仍写 `@req:<id> @human`（作者按需手改 `@rule @executable`；add-req 是治理起步的保守默认）。

## 3. specs 转换清单（13 文件，85 → `@rule @executable`，2 → `@rule @human`）

按 capability（triage 分类见 `docs/research/dedup-human-triage-plan.md` §3）：全部 A/A+ 规则的标签改为 `@rule @executable`；A+ 同时补验收；仅 eval-playbook r84/r85 改为 `@rule @human`。转换后 `@human` 仅剩 2 条；`@rule @executable` 85 条；验收总数不变（+新增补验收）。

## 4. 验收补足设计（A+ 15 条）

每处补验收的场景名、GIVEN 断言点与步骤定义落点（tests/bdd/steps/*.ts）：

| capability | req | 补验收要点 | 步骤落点 |
|---|---|---|---|
| change-lifecycle | r14 | start 在非默认分支被拒（报错含默认分支名+建议） | lifecycle.ts |
| change-lifecycle | r44 | `change attach --base` 目标分支不存在报错；`--base` == 当前分支报错 | lifecycle.ts |
| change-lifecycle | r68 | `start --worktree` 新 worktree 内 proposal 缺失 → 报错且 worktree/分支被移除 | lifecycle.ts |
| change-lifecycle | r69 | `archive` 合并前对目标 worktree 持有/脏 的两态（复用 finalize 语义） | lifecycle.ts |
| peripheral-commands | r30 | 块式 `depends_on` 与流式解析一致；畸形 frontmatter 不中断输出 | peripheral.ts |
| peripheral-commands | r61 | 多前缀命中报错并列全部候选；大小写敏感；spec 精确匹配优先于同前缀 change | peripheral.ts |
| context-index | r26 | `.rebuild.lock` create-new 互斥 + 陈旧锁清理；tree.json 顶层字段结构 | context-index.ts |
| context-index | r27 | 工具三件套名与 12 轮上限（注入 mock 断言） | context.ts |
| context-index | r57 | 优先级 CLI > env > 缺省 | context-index.ts |
| review-freeze | r23 | `--export-html` 产出自包含 HTML | review.ts |
| review-freeze | r24 | 7z 失败回滚：已写平铺卡回滚且原目录保留 | archive.ts |
| review-freeze | r25 | 未知名报错含可用条目列表；legacy 无卡条目可按 7z 条目名回置 | archive.ts |
| eval-playbook | r82 | 缺 Harbor/Pi 依赖的 die 路径（抽函数或以 PATH 隔离断言）非零退出 | （单测内） |
| eval-playbook | r83 | groups 至少 1 组、worktree 缺省解析仓库根、n<3 标注 insufficient | （单测内） |
| eval-playbook | r86 | models.json 生成：provider/api/thinkingLevelMap/thinking=max 断言 | （单测内） |

## 5. 缺口 G1 修复设计

- spec 语义维持「跳过符号链接」；实现把 `NextIdIo.isDirectory` 的构造点改为不跟随符号链接：`lstatSync(p).isDirectory()`（或 `statSync(p, { throwIfNoEntry: false })` 判断 `SymbolicLink`）。改 `apps/cli/src/commands/change.ts` 与 `apps/cli/src/io.ts` 两处构造点（core 纯域逻辑本身只依赖注入接口，不动）。
- 补单测（packages 或 tests/unit）：符号链接目录名含 `c<N>` 不得计入 next-id；普通目录仍计入。
- 补 BDD 验收（change-lifecycle r35）场景 + 锚定步骤。
- 注意：core 纯度纪律（monorepo r3）要求 FS 副作用经接口注入——symbolic-link 判定由 CLI 注入端（io.ts/change.ts）实现，core 不变，不违反纯度门禁。

## 6. 模板同步清单（阶段 2 强制）

- `packages/core/templates/{zh-Hans,en}/skills/llman-sdd-propose.md`：单轨/tag 语法节补充 `@rule` 模型（规则可 `@rule @executable`，验收挂回规则；`@rule @executable` 必须链接验收或自带步骤）。
- `…/llman-sdd-verify.md`：合约轴审查措辞「@human 规则与 @executable GWT」→「@human/@rule @executable 规则」。
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
