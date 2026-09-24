# Design: 把复盘教训固化进 skill 模板,并为仓库自带 skills 加新鲜度门禁

## 1. 教训清单(证据)

| 编号 | 教训 | 先例 | 落点 |
|---|---|---|---|
| L1 | 门禁证据必须来自真实 harness,失败先查根因 | A:harness 失败被定性为「自指设计属性」并以 `--no-check` 绕过;根因是临时仓库子进程继承 `LLMAN_SDD_HARNESS_ACTIVE` | apply §5、verify 硬约束 |
| L2 | 审查者亲自复跑门禁,不采信实现者报告 | A 的 CRITICAL 由审查方复跑发现;B 报告的门禁结论经复跑才确认 | verify 硬约束 + 步骤 2 |
| L3 | 前后对比基线在 change 分支上测量 | B 报告「T0 STALE = 0」在 main 上测得,恒为 0 | apply §5、verify 步骤 4、propose 写 tasks.md 节 |
| L4 | 编辑与验证串行 | 审查方在同一批并行调用中编辑并跑测试,读到旧文件致假失败 | apply §4 |
| L5 | 重构类 task 对比测试用例数 | Q4 批量替换险些让 `meta-foundation.ts` 因缺导入不注册,typecheck 拦截 | apply §5 |
| L6 | 仓库自带 skills 过期无门禁 | `.agents/skills` 停在 0.3.1,7 文件教已删表面(f77a279 手工修) | golden:check |

L1–L5 是**通用**教训,任何使用 llman-sdd 的项目都会踩,因此进模板;L6 是**本仓库**狗粮特有,只进本仓库门禁。

## 2. 决策(已定案)

### D1 模板措辞(双 locale 同义,措辞可微调但必含标记不可缺)

**apply §4「逐任务实施」列表新增一项(L4)**:

- zh-Hans:「**编辑与验证串行**:验证 MUST 在编辑落盘后执行;MUST NOT 把编辑与测试/校验放在同一批并行工具调用中(验证可能读到旧文件,产生假失败或假通过)。」
- en:「**Edit, then verify — serially**: verification MUST run after edits land on disk; MUST NOT put edits and tests/validation in the same parallel tool-call batch (the check may read stale files and report a false failure or a false pass).」

**apply §5「验证与自修复循环」在「若失败 → 进入自修复循环」前新增「门禁证据」小节(L1/L3/L5)**:

- zh-Hans:
  - 「门禁结论 MUST 来自真实 harness:MUST NOT 以 `--no-check` 取得『通过』;harness 失败 MUST 先查根因(环境变量泄漏、嵌套调用守卫、工作目录错误等),MUST NOT 以『固有/自指属性』定性后绕过。」
  - 「前后对比类完成判据(计数、基线)MUST 在 change 分支上测量(相对现算 merge-base);在默认分支测得的值通常恒为基线,不构成证据。」
  - 「重构或批量替换类 task:MUST 对比改动前后的测试用例数;门禁全绿但用例数下降视为失败。」
- en:
  - 「Gate verdicts MUST come from the real harness: MUST NOT obtain a "pass" via `--no-check`; on harness failure, find the root cause first (leaked env vars, nested-invocation guards, wrong cwd …) — MUST NOT label it an "inherent/self-referential property" and bypass it.」
  - 「Before/after completion criteria (counts, baselines) MUST be measured on the change branch (against the freshly computed merge-base); a value measured on the default branch is usually trivially the baseline and proves nothing.」
  - 「Refactors and bulk replacements: MUST compare the test count before and after; all-green gates with fewer tests is a failure.」

**verify 硬约束新增两项(L1/L2)**:

- zh-Hans:「**亲自复跑门禁**:MUST 亲自重跑 `llman-sdd validate <id> --strict`(真实 harness)与项目门禁,MUST NOT 采信实现者报告中的门禁结论;复跑结果与报告不符 → CRITICAL。」「门禁证据以 `--no-check` 取得 → CRITICAL。」
- en:「**Rerun the gates yourself**: MUST rerun `llman-sdd validate <id> --strict` (real harness) and the project gates; MUST NOT trust gate verdicts in the implementer's report — a mismatch is CRITICAL.」「Gate evidence obtained with `--no-check` → CRITICAL.」

**verify 步骤 4 合约轴新增一条(L3)**:核对前后对比类证据是否在 change 分支上测量(措辞同 apply,标记同)。

**propose「写 tasks.md」节新增一句(L3)**:「前后对比类完成判据 MUST 注明在 change 分支上测量(相对 merge-base)。」/ en:「Before/after completion criteria MUST state they are measured on the change branch (against merge-base).」

### D2 对账必含标记(`template-guidance-parity.test.ts` 的 `REQUIRED_PER_FILE`)

| 模板 | 新增标记(`en|zh` 交替串) |
|---|---|
| `skills/llman-sdd-apply.md` | `real harness\|真实 harness`、`parallel tool-call batch\|同一批并行工具调用`、`measured on the change branch\|在 change 分支上测量`、`test count\|用例数` |
| `skills/llman-sdd-verify.md` | `real harness\|真实 harness`、`Rerun the gates yourself\|亲自复跑门禁`、`measured on the change branch\|在 change 分支上测量` |
| `skills/llman-sdd-propose.md` | `measured on the change branch\|在 change 分支上测量` |

选标记的原则:必须是**新措辞独有**的短语。`--no-check` / `merge-base` 已在 verify 现有正文出现,不能作标记(删掉新段落也不会失败)。

### D3 仓库自带 skills 新鲜度门禁(L6)

- 从 `tests/golden/check.ts` 抽出 `normalizeTree` / `diffTrees` 到 `tests/golden/lib.ts`,并把 `diffTrees` 改为**返回**差异列表(`{ file, kind: 'missing' | 'extra' | 'changed' }[]`),打印由调用方负责——供 check 脚本与 BDD 步骤共用。
- `check.ts` 追加第三组比对:`<repo>/.agents/skills` 对 `baseline/skills`(zh-Hans),**仅比对 `llman-sdd-` 前缀目录**(`extra_skills` 或用户自建 skill 不参与);失败输出差异文件名与种类,末尾提示 `run: bun apps/cli/src/main.ts init --update`。
- 前置一致性:比对前断言仓库 `llmanspec/config.yaml` 的 `locale` 与 `bdd.run_command` 与 golden `CONFIG_YAML` 一致;不一致时报 `golden CONFIG_YAML drifted from llmanspec/config.yaml`(否则新鲜度比对会以错误配置误报)。
- 新 rN 的 `@executable` 场景两条:正向(仓库 `.agents/skills` 与基线一致)与反向(把仓库 skills 复制到临时目录并改动一个文件 → 比对报出该文件名与 `changed`)。反向场景只在临时副本上操作,MUST NOT 改动仓库文件。

### D4 spec 措辞

- r70 与 monorepo-structure r67 中「渲染产物与 golden 基线为下游,不重复设门」:补一句限定——指**模板字面对账**不在下游重复;仓库自带产物的新鲜度比对是独立门禁(见新 rN)。
- r70 陈述扩展:apply/verify/propose 三模板 MUST 含 D1 所述约束句,缺失 MUST 报出模板与缺失标记。
- 新 rN(`spec next-req-id` 分配):仓库已提交的 `.agents/skills` 中 `llman-sdd-` 前缀产物与 golden 基线(zh-Hans)版本号归一化后 MUST 一致,MUST 随 `golden:check`(qa)运行;失败 MUST 报出差异文件与种类并提示 `init --update`。

## 3. 非目标

- 不改任何 CLI 行为;不新增 `init --check` 之类的 CLI 新鲜度命令(若下游有需求另起 change)。
- 不把本仓库特有的教训(`TMPDIR` 沙箱、`LLMAN_SDD_HARNESS_ACTIVE` 剥离、`tests/helpers/spawn.ts`)写进通用模板——它们已在 `llmanspec/AGENTS.md`。
- 不改 skill 的结构与 unit 划分;只在既有小节内追加。
