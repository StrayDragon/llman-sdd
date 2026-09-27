# SDD「去 human 整理」triage 与执行规划

> 阶段 0（explore）产物。本仓 SDD 行为合约唯一事实来源为 `llmanspec/specs/*.feature`；
> 本规划是后续各 change 的 triage 依据引用（各 proposal 需注明「规则 X → 分流类别 Y，依据本规划 §N」）。
> 日期以当天实测为准；本文件非行为合约，不参与 validate / golden / 渲染门。

## 0. 结论摘要（人读优先）

- **现状基线**：13 个 capability、87 条 `@human` 规则、163 条 `@executable` 验收；复盘后 `pending`=0、`unbound`=0、`stale` 对本地 base 全 OK；`just qa` 全绿（427 测试、渲染门/pending/schema 全过）；`validate --strict` 通过；`review` criticalCount=0。
- **分流结论**：87 条规则中——**完整守护（A）69 条**、**可自动化但覆盖不足/验收虚挂（A+）15 条**、**纯治理/人工约束（H）2 条**、**确认缺口（G）1 条**（change-lifecycle r35 符号链接项；r82 经核实现已具备硬性退出，重分类为 A+——已实现但无验收守护）。
- **中央待决策**：当前验证引擎强制「规则只能是 `@human` 场景 + `@executable` 仅能挂回存在的 `@human` 规则」，且每 capability 至少 1 条 `@human`。因此「把可自动化规则分流为 @executable」有两条路线（引擎级改造 vs 现状模型下补齐守护），见 §6。此项待用户定夺后各 change 才可动手。
- 任务提示中「init-generators 1 条 STALE」与「87 条=17/14/11/11/6/6/6/5/5/4/3/2/3 分布」经实测已过时：分布为 change-lifecycle 17 / validation 13 / init-generators 9 / peripheral-commands 11 / context-index 6 / monorepo-structure 6 / spec-parsing 4 / review-freeze 5 / eval-playbook 5 / spec-authoring 3 / cli 3 / config-command 2 / config-schema 3（合计 87）。STALE 仅在对 `origin/main` 基线时出现于 context-index/spec-parsing/spec-authoring 三文件——本地超前 origin 的正常漂移，非缺陷。

## 1. 实测基线（当日数据，来源命令）

```text
$ bun apps/cli/src/main.ts list --specs --json   # morphology 口径
change-lifecycle   rules=17 acceptances=45 pending=0
validation         rules=13 acceptances=26 pending=0
init-generators    rules=9  acceptances=11 pending=0
peripheral-command rules=11 acceptances=18 pending=0
context-index      rules=6  acceptances=7  pending=0
monorepo-structure rules=6  acceptances=6  pending=0
spec-parsing       rules=4  acceptances=6  pending=0
review-freeze      rules=5  acceptances=9  pending=0
eval-playbook      rules=5  acceptances=5  pending=0
spec-authoring     rules=3  acceptances=8  pending=0
cli                rules=3  acceptances=5  pending=0
config-command     rules=2  acceptances=3  pending=0
config-schema      rules=3  acceptances=7  pending=0
合计 87 条规则 / 163 条验收

$ just qa            → 全绿（427 pass / 0 fail，渲染门、pending-gate、schema 通过）
$ bun apps/cli/src/main.ts review → criticalCount=0 warningCount=0
$ bun apps/cli/src/main.ts validate --all --strict → 通过
```

> 注：`grep -c '@human'` 会多算——规则语句正文里出现 "@human/@executable" 字样（如 r66/r70）也会命中。规则数以 `list --specs --json` morphology 为准。

## 2. 引擎模型约束（决定分流形态的前提，务必先读）

`packages/core/src/spec/parser.ts` + `packages/core/src/validation/validate.ts` 强制执行：

1. **规则 = `@human` 场景**：场景描述(docstring 行)即规则语句，必须含 MUST/SHALL 语义词（`rule:missing-must-word`）；必须带 `@req:<id>`；`@human` 与 `@executable` 互斥（`tag:mutually-exclusive`）。
2. **验收 = `@executable` 场景**：必须至少一个 `@req:<id>` 且该 id MUST 命中存在的 `@human` 规则，否则 `no matching @human constraint` ERROR；无任何 `@req` 为孤儿 WARNING。
3. **每 capability MUST 至少 1 条 `@human` 规则**（`spec must define at least one @human constraint scenario`）。
4. 规则无配对验收 → INFO `pending`（`review` 的 pending 信号、`pending-gate` 计量，当前基线 maxPending=0）。
5. BDD runner（`tests/bdd/run.test.ts`）仅执行带 `@executable` 的场景（`onlyTagged`），步骤全匹配锚定，`bun test tests/bdd` 必须全绿。

**推论**：在现行引擎下，一条「可自动化行为」规则无法只靠改标签成为 @executable——它有且仅有两条出路：
- **路线 L（轻）**：保留规则 = `@human` 语句（收窄为单条 MUST 本质句），行为细节全部由 `@executable` 验收 + BDD 步骤承载；对覆盖不足处补验收/步骤。标签语义不变（@human=规则锚点），但「行为可由程序判定」全面落地。
- **路线 H（重）**：改造引擎，允许「规则场景本身 = @executable」（0 条 @human 的 capability 合法、@req 可挂往可执行规则、MUST 词门按规则定义重构），并把可自动化规则逐一改写为 GWT。这同时要求改 validation r12/r65、spec-parsing r9、review pending/unbound 语义、`spec add-req`/`add-scenario`、技能模板 r66 措辞、BDD fixtures 与 golden。成本显著，收益是标签语义彻底对齐「@human=仅真治理」。

> §6 将这一点列为待决策 #0，连同任务 §8 的四问一并请用户拍板。

## 3. 三分流矩阵（逐规则）

类别定义：
- **A** = 已完整守护（规则语句 + 全覆盖 `@executable` 验收 + 锚定 BDD 步骤；行为可程序判定，无需动作）。
- **A+** = 可自动化但**覆盖不足/验收虚挂**：规则语句含未由验收直接判定的行为主张（实现多数已存在）→ 需补验收场景 + BDD 步骤（「转 executable」的实质工作量）；或验收为「以步骤固化」的间接形式，需补齐判别粒度。
- **H** = 纯治理/人工约束/外部事实，无法程序断言 → 保留 `@human`，proposal/design 记录不可自动化理由。
- **G** = 缺口：规则声称 MUST 但实现/守护缺失 → 补实现+验收，或降级/删除规则。

### 3.1 change-lifecycle（17 条）

| req | 规则（场景名） | 类别 | 依据 / 待办 |
|---|---|---|---|
| r14 | 分支绑定门 | A+ | 未直接验收「start 在非默认分支」门（r31 只覆盖 attach）；补验收 |
| r15 | finalize 合并与归档收口 | A | squash/非绑定/冲突 best-effort 均有验收 |
| r16 | 默认分支 local-first 解析 | A | 全分支布局验收齐 |
| r31 | attach 默认分支门 | A | 报错文案 + detached HEAD 齐 |
| r34 | stage 单调推断规则 | A | tasks-only 判 draft + 全阶段单调齐 |
| r35 | next-id 数字编号计数 | **G** | **实现缺口**：规则声明「跳过符号链接与点目录」，实现 `statSync().isDirectory()` 跟随符号链接（apps/cli/src/commands/change.ts:97、apps/cli/src/io.ts:53），符号链接目录会被递归计入；点目录跳过已实现。需补 lstat 语义或修订规则 + 补验收 |
| r36 | change new --dry-run 派生预览 | A | 两验收齐 |
| r39 | change archive 独立收口 | A | 独立收口/兼容旗标/门禁 dry-run 齐 |
| r40 | change archive 任务门禁 | A | 未勾报错 + --force 齐 |
| r44 | change new/attach 兼容 flag | A+ | `--base` 分支「必须存在且≠当前分支」未直接验收；`--verb` 自动识别仅间接 |
| r45 | start 前缀与 finalize 校验/收口的取值序 | A | 前缀序/预合并 sweep/no-commit/合并序齐 |
| r46 | change diff 结构化输出 | A | json/export-patch/计数不受 base 影响齐 |
| r60 | change_id template 渲染 | A | 渲染/未定义变量报错齐（llman_sdd_unique_id 细节未单列验收，可接受） |
| r68 | start 分叉保真与 worktree 模式 | A+ | proposal 缺失回滚已实现（lifecycle.ts:188-197）但未直接验收；fork 源取值序未验收；补验收 |
| r69 | finalize/archive worktree 感知目标执行 | A+ | finalize 三态齐；archive 侧 worktree 感知未单独验收 |
| r79 | finalize/archive 任务门收口伪任务点名 | A | 点名报错验收齐 |
| r81 | 收口合并前执行验收命令 | A | 全部 7 条验收（成功/失败/未配置/needs_false/no-check/嵌套/archive）齐 |

### 3.2 validation（13 条）

| req | 规则 | 类别 | 依据 |
|---|---|---|---|
| r11 | 判定聚合与报告行格式 | A | 报告行聚合/退出码验收齐 |
| r12 | 规则域（种子缺陷判定） | A | 种子缺陷逐类判定验收齐 |
| r13 | BDD harness 执行与 check 旗标 | A | 缺省执行/no-check/嵌套/未配置/review-show 不执行齐 |
| r32 | INFO 级 issue 缺省过滤 | A | 过滤与恢复齐 |
| r47 | validate 目标与模式 flag | A | 消歧/阶段门/输出模式/strict 齐 |
| r48 | bdd run_command 占位符与结果映射 | A | 占位符逐项/整批一次/失败映射齐 |
| r63 | validate 完整性 WARNING | A | 未 landed + 脏 specs + strict 升级齐 |
| r64 | proposal frontmatter 合法字段集 | A | 非法字段/归档免检齐 |
| r65 | 孤儿验收场景 | A | 孤儿 WARNING + 悬空 ERROR 齐 |
| r73 | frontmatter 依赖引用解析与单一解析口径 | A | 未知依赖/平铺卡/正文同名齐 |
| r74 | 用户输出不含内部需求编号 | A | 失败路径无编号 + 文案族齐 |
| r78 | tasks.md 收口伪任务 WARNING | A | 触发/不触发齐 |
| r87 | change id 全局唯一性门禁 | A | 活跃/冻结冲突齐 |

### 3.3 init-generators（9 条）

| req | 规则 | 类别 | 依据 |
|---|---|---|---|
| r17 | 模板渲染语义 | A | 渲染语义可执行验收齐 |
| r18 | locale 兜底链 | A | 兜底链可执行验收齐 |
| r19 | init 产物面与命名空间治理 | A | zh/en 基线归一化齐（由 tests/golden 承载） |
| r49 | init 目标路径 | A | 子目录目标验收齐 |
| r50 | init locale 选项别名 | A | 别名等效验收齐 |
| r66 | spec 撰写配对引导判据 | A | 判据入渲染产物验收齐；**若路线 H 落地，本条需同步修订** |
| r70 | 模板指引语义对齐 | A | 由 template-guidance-parity 单测守护（「以 BDD 步骤固化」范式） |
| r71 | authoring helpers 撰写引导 | A | 引导入渲染产物验收齐 |
| r80 | 仓库自带 skills 新鲜度 | A | 一致/过期报出齐（渲染门承载） |

### 3.4 peripheral-commands（11 条）

| req | 规则 | 类别 | 依据 |
|---|---|---|---|
| r20 | list 合同 | A | 结构/遗留旗标齐 |
| r21 | show 与 graph 合同 | A | 输出契约验收齐 |
| r22 | spec 助手与 migrate 引导壳 | A | 三态/不产生根 src 齐 |
| r30 | graph 依赖边解析双风格 | A+ | 块式风格等价与畸形 frontmatter「不中断」未直接验收；补验收 |
| r51 | list 排序与紧凑 JSON | A | 排序/单行 JSON 齐 |
| r52 | show 文本输出与 Why/What Changes 门 | A | 文本不设门/json 设门齐 |
| r53 | show spec 检视与 output 修饰 | A | 全量渲染/拒绝已删 token 齐 |
| r54 | graph 范围与深度 | A | scope/冻结卡/format/depth 齐（graph-scope-depth-defaults 已落地） |
| r55 | spec 助手兼容 flag | A | force/json 齐 |
| r58 | proposal 扫描深度全局旋钮 | A | 旋钮 + review/graph 遵守齐 |
| r61 | change id 前缀解析 | A+ | 唯一前缀命中齐；多命中列候选、大小写敏感、spec 优先于同前缀 change 未直接验收；补验收 |

### 3.5 context-index（6 条）

| req | 规则 | 类别 | 依据 |
|---|---|---|---|
| r26 | 索引构建与新鲜度 | A+ | fresh/stale 闭环齐；**`.rebuild.lock` create-new 互斥与陈旧锁清理、tree.json 字段结构未直接验收**；补验收 |
| r27 | context agentic 检索合同 | A+ | model 未设不可用齐；三件套工具名、12 轮上限精确语义未直接验收（r29 间接覆盖轮耗尽）；补验收 |
| r28 | 检索结果去重 | A | 跨档/同档去重齐 |
| r29 | 输出汇总与降级契约 | A | 轮耗尽/API 失败齐 |
| r57 | context/index backend 旗标 | A+ | rag 报错齐；CLI>env>缺省优先级未直接验收；补验收 |
| r62 | context 检索前索引懒刷新 | A | 无索引自愈齐（missing/corrupt 共享路径） |

### 3.6 monorepo-structure（6 条）

| req | 规则 | 类别 | 依据 |
|---|---|---|---|
| r1 | 工作区布局 | A | 只读对账断言（tests/bdd/assert/monorepo-layout.ts）——「以脚本固化」范式 |
| r2 | 质量门禁 | A | 对账断言 quality-gates.ts |
| r3 | core 纯域纪律 | A | 对账断言 core-purity.ts |
| r4 | BDD runner 就绪 | A | 对账断言 bdd-runner.ts |
| r67 | 模板命令对账 | A | template-command-parity 单测 |
| r72 | core 模块依赖对账 | A | module-dependency-parity 单测 |

### 3.7 spec-parsing（4 条）

| req | 规则 | 类别 | 依据 |
|---|---|---|---|
| r7 | 解析语言兜底链 | A | en 起步回退 zh-CN + locale 映射 + skeleton 派生齐 |
| r8 | 头注释契约 | A | 缺失逐项报告齐 |
| r9 | 标签分层语义 | A | 中文解析 IR + 违例逐项齐；**路线 H 时需修订** |
| r10 | 全局 rN 注册表 | A | 重复对报告齐 |

### 3.8 review-freeze（5 条）

| req | 规则 | 类别 | 依据 |
|---|---|---|---|
| r23 | review 五信号聚合合同 | A+ | 信号形状/别名齐；`--export-html` 未直接验收；补验收 |
| r24 | freeze 冷备合同 | A+ | dry-run/平铺卡/非主检出齐；**7z 失败回滚原子性未直接验收**；补验收 |
| r25 | thaw 回置与双向兼容 | A+ | 自洽/回置删卡齐；未知名报错+可用条目列表、legacy 无卡条目回置未直接验收；补验收 |
| r33 | review --capability 过滤口径 | A | 过滤生效齐 |
| r56 | thaw 目的地覆盖 | A | --dest 齐 |

### 3.9 eval-playbook（5 条）

| req | 规则 | 类别 | 依据 |
|---|---|---|---|
| r82 | Harbor 剧本不进入 qa 与 golden | A+ | 「不纳入 qa」由 bdd 验收守护；「缺 Docker/Harbor/Pi 非零退出、MUST NOT skip 成绿」在 `eval/run.ts` 已实现（die/process.exit）但**无验收守护**——补验收（在临时环境断言 die 路径或抽函数单测） |
| r83 | groups 至少一组且比较组可选 | A+ | groups 文档校验单测守护；五项验收全部「执行同一单测断言退出码 0」——验收虚挂粒度不足，主张的多数字段细节未被逐条判别 |
| r84 | 独立镜像只读挂载并在容器内拷贝 | H | 容器步骤、两轮同容器 git 历史、min_reward 中止等为 Docker 外部行为，qa 无法程序断言；保留 @human + 记录理由（schema 单测部分守护） |
| r85 | 机械准则优先且并发尽量为 2 | H | 裁判准则/并发默认是外部剧本治理；n_attempts<n3 等部分由 schema 单测守护；保留 @human + 记录理由 |
| r86 | Pi 注入完整 Responses API 配置且 0731 默认思考 max | A+ | models.json 生成由单测守护；验收与其他四条同形（同一单测），判别粒度需提升 |

> 注：eval-playbook 五条 `@executable` 验收步骤完全相同（`执行命令 "bun test tests/unit/eval-groups-schema.test.ts" → 退出码为 0`，锚定于 tests/bdd/steps/smoke.ts）。属「真实执行但虚挂」：未按规则逐条判别。若走路线 H，本条 capability 是最典型的改造样本。

### 3.10 spec-authoring（3 条）

| req | 规则 | 类别 | 依据 |
|---|---|---|---|
| r41 | spec add-req 追加规则 | A | 闭环/词边界/目录式齐 |
| r42 | spec add-scenario 追加验收场景 | A | 追加+缺失零副作用/目录式齐 |
| r43 | resolve-req 反查与注册表去重 | A | 反查/dry-run/重映射齐 |

### 3.11 cli（3 条）/ 3.12 config-command（2 条）/ 3.13 config-schema（3 条）

| capability | req | 规则 | 类别 | 依据 |
|---|---|---|---|---|
| cli | r75 | 错误出口单一前缀与退出码 | A | 未知命令/域错误齐 |
| cli | r76 | 报告命令输出旗标共享注册 | A | compact-json 单行/兼容别名齐 |
| cli | r77 | 全局旗标面 | A | 兼容旗标 unknown option 齐 |
| config-command | r37 | config 只读概览 | A | 五要素只读齐 |
| config-command | r38 | config skills 非交互管理 | A | 非交互/共享旗标齐 |
| config-schema | r5 | 顶层字段域 | A | 未知字段宽松/遗留键剥离齐 |
| config-schema | r6 | 校验失败报告与 artifact 漂移门 | A | 非法拒绝/漂移 check 齐 |
| config-schema | r59 | change_id pattern 契约 | A | validate 域强制/加载即报错齐 |

## 4. 缺口清单（G）与处理建议

| # | capability | req | 缺口描述 | 建议 |
|---|---|---|---|---|
| G1 | change-lifecycle | r35 | 规则声明「跳过符号链接」，实现（`statSync().isDirectory()`，apps/cli/src/commands/change.ts:97、io.ts:53）跟随符号链接，符号链接目录会被递归计入 | 补实现（lstat 或 isSymbolicLink 前置判定）+ 补验收（符号链接目录不计）；或按用户偏好降级规则（从 MUST 降为不承诺） |

分布：确认缺口仅 G1（change-lifecycle）；eval-playbook r82 经核证为已实现未守护（见 §3.9，划入 A+）。其余 capability 未发现实现级缺口。

> G2 核证说明：`eval/run.ts` 已实现硬性退出（`die('... will not skip')`、`process.exit(code)`、`harborArgv` 缺失即 die），即 r82 「缺依赖非零退出」行为真实存在但无任何验收守护——故 r82 划入 A+（补验收即可收口），不构成实现缺口。

## 5. 覆盖不足（A+）汇总与分批建议

A+ 共 15 条，分布在 change-lifecycle(4: r14/r44/r68/r69)、peripheral-commands(2: r30/r61)、context-index(3: r26/r27/r57)、review-freeze(3: r23/r24/r25)、eval-playbook(3: r82/r83/r86)。均无实现缺口，以「补验收场景 + BDD 步骤」收口；涉及 worktree/archive/7z/harness 的补充验收需复用既有 fixture 基建（tests/bdd/steps/lifecycle.ts、archive.ts 已有可复用步骤）。

**分批建议（并行约束：同批 change 的 specs 文件两两不相交）**：
1. `dedup-human-change-lifecycle`（17 条大文件，G1 + A+ 4 条 + A 措辞复核）——独立成批
2. `dedup-human-validation`（13 条 A，仅措辞复核，可 quick 或最小 change）
3. `dedup-human-init-generators`（9 条 A，含 r66 措辞联动）
4. `dedup-human-peripheral-commands`（A+ 2 条）
5. `dedup-human-context-index`（A+ 3 条）
6. `dedup-human-monorepo-spec-parsing` 或拆开（均可 A，措辞复核）
7. `dedup-human-review-freeze`（A+ 3 条）
8. `dedup-human-eval-playbook`（H 2 条 + A+/G2 待核 3 条，验收虚挂重构）
9. 其余小文件（spec-authoring/cli/config-command/config-schema）可并入或 quick

> 用户 §8 决策 #1 选定粒度后按该粒度重组；核心要求：同批并行 change 的 `llmanspec/specs/**` 文件不相交；每批必须完成后 `change finalize` + 删分支。

## 6. 待决策清单（展示给用户后动手）

1. **#0 路线（本规划新增，最高影响）**：路线 L（轻，不改造引擎——补验收/步骤使全部可自动化行为机器守护，`@human` 规则收窄为单条 MUST 锚点）vs 路线 H（重，改造验证引擎允许 @executable 规则，标签语义彻底对齐）。推荐 **路线 L**：仓库已达成每规则配对验收 + CI 全绿，引擎改造属元规范大改，风险与工作量不成比例；路线 L 在「行为可自动判定」事实上与路线 H 等价，且不触碰 SDD 自身门禁。
2. **§8#1 分批粒度**：按 capability 一 change 一文件（推荐，符合并行约束）vs 合并大 change。
3. **§8#2 缺口处理**：确认缺口仅 G1（r35 符号链接）。优先补实现（改动面小、收益明确）vs 先降级/删除规则（轻，但损失行为确定性）。推荐：G1 修实现（lstat 判定 + 验收）。
4. **§8#3 是否顺带 ran specs-compact**：整理中规则措辞理顺属 compact 范畴；推荐本次不额外运行（行为不变压缩留待主线外专项），除非用户要求。
5. **§8#4 通用整理中暴露的无关问题**：当场小 quick 修 vs 记录待办。推荐：渲染门/卫生类当场修，跨模块设计类记录待办。

## 7. 执行要求速记（各 change 必须遵守）

- 行为合约改动走 `llman-sdd-propose → apply → verify`；每批 `validate --strict`、`just qa`、`review`（criticalCount=0）全绿后 `change finalize` + `git branch -D`。
- 转换/新增的每条 `@executable` 验收 MUST 配锚定 BDD 步骤（runner 全匹配），`bun test tests/bdd` 全绿。
- 保留的 `@human` 规则 MUST 为单条可读语句且含 MUST/SHALL；多条语句拆开。
- 涉及模板/CLI 面（r66/r70/r71/r80、技能文本中的分流条款措辞）的 change MUST `init --update` + 重生成 golden 基线 + 提交 `.agents/skills`。
- 编辑与验证串行；验证不得与编辑同批并行。
- `@human` 与 `@executable` 不得同场景。
- 不收口任务进 tasks.md；任务门要求全部任务勾选。

## 8. 模型定案（2026-09-27，替代上文 §2/§6 的中间框架）

> 用户裁定后最终采用**互斥模型**（change `dedup-human-executable-rules`，已 finalize 归档）。上文 §2「路线 L/H」与 §6「@rule @executable 组合」属提出后即被否定的中间框架，以下方定案为准：

- **`@rule` 与 `@executable` 互斥**（同场景判 ERROR）：`@executable` = 可执行行为/验收（假如/当/那么 步骤绑定 BDD 代码，runner 执行，**默认首选**）；`@rule` = 无法程序化表达（抽象目标/架构决策/治理）或暂不转写的需求锚点；`@rule @human` = 纯人工/治理约束（statement 须含 MUST/SHALL）。`@human` 单独出现仍隐式规则（旧文档兼容）。
- **撰写引导优先 executable、尽可能减少 `@rule` 定义**，模板含「何时用 executable / 何时用 rule」示例（init-generators r66 与两语种技能模板已同步）。
- 引擎守护：`@rule` 可自动化规则（非 @human）无链接验收且无步骤 → ERROR；每 capability 至少 1 条规则；验收 `@req` 必须挂回规则。
- 实际落地：87 条规则 → 85 条 `@rule`（行为由既有 163 条 `@executable` 验收承载）+ 2 条 `@rule @human`（eval r84/r85）。
- 上表（regen 后）中 A+ 各项的实际处置以归档 change 的 design.md §4 为准（补验收/共享路径/维持既有三类）。
