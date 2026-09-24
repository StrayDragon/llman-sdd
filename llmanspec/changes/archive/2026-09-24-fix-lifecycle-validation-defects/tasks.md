# Tasks

测试接缝(seam):CLI 子进程 + `makeTempRepo`(`tests/bdd/steps/shared.ts`),步骤落在 `tests/bdd/steps/{validation,lifecycle,archive}.ts`;单测只用于纯函数(切分器、占位符展开、结果映射)。不发明新 seam。每个任务「完成判据」全部满足才可勾选;`CLI` = `bun apps/cli/src/main.ts`。

**通用约束**:新增 Then 必须直接断言场景文本中的每个事实,禁止以退出码代理;文件所有权与 req 号段见 design.md §7。

- [x] T0: Specs landing——validation.feature(改写 r13/r48/r63,新增 r73/r74 与验收场景)、change-lifecycle.feature(改写 r46/r68,新增验收场景);绑定分支 commit [blocked-by: 无]
  - 完成判据:`CLI validate validation --type spec --strict` 与 `CLI validate change-lifecycle --type spec --strict` 退出 0;`bun test tests/bdd` 中新增场景以 `No step definition` 失败(红灯即预期)

- [x] T1: frontmatter 单一切分器 + `readNeedsSpecsChange` + `specsLanded`(design D2)[blocked-by: T0]
  - 范围:`change/frontmatter.ts` 只保留一个 `splitFrontmatter`;`changeCheck.ts`、`report/show.ts` 改调两个 helper,删除内联正则与 `includes('llmanspec/specs/')`
  - 单测(`tests/unit/frontmatter.test.ts`)新增:① EOF 闭合无换行的 proposal,`extractFrontmatter` 与 `readBinding` 结果一致(同为可读);② 正文含 `needs_specs_change: false` 而 frontmatter 缺该键 → `readNeedsSpecsChange` 为 true;③ `diff --name-only` 输出含 `docs/llmanspec/specs/x` 而无 `llmanspec/specs/` 前缀行 → `specsLanded` 为 false;④ `writeBinding` 往返后闭合为 `\n---\n`
  - 完成判据:`rg -n "needs_specs_change:\\\\s" packages/core/src` 仅命中 `frontmatter.ts`;`rg -n "includes\\('llmanspec/specs/'\\)" packages/core/src` 零命中;上述 4 条单测通过
  - 注:为满足第一条判据(读逻辑正则只留 frontmatter.ts),show.ts:109 与 changeCheck.ts r63 文案中的字面 `needs_specs_change: false` 改写为 "set needs_specs_change to false"(纯文案,语义不变)

- [x] T2: 依赖引用解析 r73(design D1)[blocked-by: T1]
  - 范围:`changeCheck.ts` 以 `resolveChangeRef` 替换 `:188-200` 条件;archive 精确匹配 `^\d{4}-\d{2}-\d{2}-<id>$`
  - 单测:夹具**必须**创建 `changes/archive/`(修复原夹具盲点)——① `depends_on: [ghost]` → ERROR 含 `references unknown change: ghost`;② 归档 `2026-01-01-other` + `depends_on: [other]` → 无 issue;③ 归档 `2026-01-01-the-other` + `depends_on: [other]` → ERROR(不得后缀误命中);④ `blocks: [ghost]` 同 ①
  - BDD:实现 r73 两个 `@executable` 场景步骤
  - 完成判据:r73 场景通过;4 条单测通过

- [x] T3: diff 计数 r46(design D3)[blocked-by: T0]
  - 注(场景 → 缺陷 → 修复):「diff 导出补丁文件」→ `--export-patch out/change.patch` 目标父目录不存在时 CLI 裸 writeFileSync 报 ENOENT → 改用 `newIo().writeText`(自动建父目录),apps/cli/src/commands/change.ts
  - 范围:`lifecycle.ts` `changeDiffInfo`
  - BDD:r46 新场景——特性分支 1 个提交后在默认分支再追加 2 个提交,`change diff --json` 的 `commitCount` 仍为 1;篡改 frontmatter `base_sha` 为任意其他提交后 `commitCount` 不变且 `base` 字段回显篡改后的值;`--export-patch <path>` 写出文件且 stdout 不含 diff 正文
  - 完成判据:r46 全部场景通过;既有「diff 结构化输出」场景不回归

- [x] T4: worktree 绑定落点 r68(design D4)[blocked-by: T1]
  - 范围:`lifecycle.ts` `startChange` worktree 分支;回滚路径(proposal 缺失时移除 worktree 与分支)
  - BDD:r68 新场景——① worktree 内 proposal 含 `branch: sdd/demo-wt` 与 `base_branch`;② 发起检出 `git status --porcelain` 为空且 proposal 字节不变;③ worktree 目标路径已存在 → 非零退出、无新分支、无新 worktree(`git worktree list` 条目数不变)
  - 完成判据:r68 全部场景通过;既有「start --worktree 建树不劫持检出」断言改为检查 worktree 内 frontmatter(原步骤读发起检出的断言删除)

- [x] T5: harness 执行核心(design D5:端口、占位符、batch-once、结果映射)[blocked-by: T0]
  - 注:为 CLI 接线在 packages/core/src/index.ts 追加了 harness 导出(expandRunCommand/runHarnessForSpecs/HarnessGate/HarnessRunner/HarnessRunOutcome/HarnessTarget)——协调规则允许的「新增 harness 导出」例外
  - 注(偏离 design D5「HarnessRunner 定义在 ports.ts」):r72 跨模块允许表(tests/unit/module-dependency-parity.test.ts,本变更不可改)禁止 validation→root 新边,故 HarnessRunner 定义在 validation/harness.ts 并经 barrel 导出;语义与 design 一致(纯端口类型、barrel 可见)
  - 范围:`ports.ts` 新增 `HarnessRunner`;`validation/` 新增 harness 模块(占位符展开、缓存、issue 映射,纯函数 + 注入 runner);`apps/cli/src/harness.ts` spawnSync 适配器(注入 `LLMAN_SDD_HARNESS_ACTIVE=1`);`commands/validate.ts` 接线触发矩阵与 help 文案
  - 单测:占位符展开(扁平 / 目录式两布局的 `{feature_path}`/`{feature_dir}`/`{feature_name}`);同键缓存只调用 runner 一次;五种结果映射的 level 与 message 前缀
  - 完成判据:单测通过;`CLI validate --help` 含 `skip the bdd harness`;`packages/core/src` 下 `rg "child_process"` 仍只命中 `git/spawnGit.ts`;harness 模块 `rg -n "process\.|Date\.now\(\)|new Date\(\s*\)"` 零命中(嵌套守卫由 CLI 读取后以参数传入,见 design D5「纯度约束」)

- [x] T6: harness 验收 r13/r48 + 调用点审计(design D5 末段)[blocked-by: T5]
  - 审计结论(`rg "'validate'" tests/bdd/steps tests/integration` 全量):tests/integration 零命中;validation.ts 14 处 CLI 调用全部逐处注释——7 处 harness 测试对象(占位符/batch-once/失败映射/no-check/嵌套守卫/--check 提示/review+show,夹具 run_command 均为确定性 echo/exit 命令)、其余为 change 域单目标(harness 不触发)或已带 --no-check(含 config.ts:1 处);review.ts 3 处命中为 signal kind 字符串标签,非命令调用,无需处理
  - 耗时记录:T0 基线 `just qa` = 13s;T6 实测 = 16s(增幅 +3s ≤ 30s;两次均在 25–38 个预期红灯下测得,口径一致)
  - 注:r48 失败映射的缓存复用消息按 v1 failure_summary 语义(原 ERROR 消息截 200)内嵌 "bdd harness failed (exit N)",满足「每个 spec 条目含该前缀」场景
  - BDD:实现 r13/r48 新场景步骤(标记文件断言逐项行集合 = capability 集合;batch-once 恰 1 行;`exit 3` → 对应 capability FAIL 且退出码非零;`--no-check` 无标记文件;设 `LLMAN_SDD_HARNESS_ACTIVE=1` 无标记文件且 `--include-info` 输出含 `nested invocation`;未配置 + `--check` 输出含 `--check has no effect`);删除旧 r48 假绿步骤 `runner 按目标逐项执行`
  - 审计:`rg -n "'validate'" tests/bdd/steps tests/integration` 的每处调用标注处理结论(加 `--no-check` / 夹具改确定性 run_command / 无需处理),结论以一行注释写在调用处上方
  - 验证 review、finalize sweep、show validate 门不执行 harness:BDD 场景「review 不执行 harness」(配置写标记文件的 run_command,运行 review 后无标记文件)
  - 完成判据:r13/r48 场景通过;`just qa` 通过且总耗时较 T0 时基线增幅 ≤ 30s(记录两次耗时于本任务注释)

- [x] T7: 模板与 golden 同步(design D5 模板段)[blocked-by: T5]
  - 已核对:git diff tests/golden/baseline 仅含 harness 表述变化(6 文件 10 行:explore/propose/verify × zh-Hans/en;validate.md 模板不在 golden 覆盖面——基线只含 10 个 skill 目录,无 llman-sdd-validate);template-guidance-parity.test.ts 无 harness 相关禁用模式,无需改动
  - 范围:`llman-sdd-{validate,verify,explore,propose}.md` zh-Hans + en;`template-guidance-parity.test.ts` 相关模式;`bun run golden:generate`
  - 完成判据:`rg -n "never executes|不执行 harness|no-op" packages/core/templates` 不再出现关于 validate harness 的旧表述;`bun run golden:check` 退出 0;`git diff tests/golden/baseline` 仅含 harness 表述变化(人工核对后在本任务注释写「已核对」)

- [x] T8: 输出卫生 r74 + 文案族统一 + r63 文案(design D6/D7)[blocked-by: T1]
  - 范围:design D6 所列字符串;`lifecycle.ts` 门文案 helper;`changeCheck.ts` r63 WARNING 尾句;CLI `ISON` 行
  - BDD:r74 场景(对非法 pattern、`--base` 不存在、detached HEAD、非绑定分支 finalize 四条失败路径断言 stdout+stderr 不匹配 `\(r\d+` 与 `(sdd-workflow|spec-format) r\d+`);r63 WARNING 含 `specs-landed gate` 且不含 `readyToImplement=true`;r31/r15 断言使用 D6 稳定子串
  - 完成判据:场景通过;design §6「输出卫生」rg 命令对字符串字面量零命中

- [x] T9: 删除遗留 + 吞异常 + 时钟注入(design D8)[blocked-by: T1]
  - 注:判据 `rg "new Date\(" packages/core/src/change` 的字面命中在 collect.ts(`new Date(latest)`,注入 mtimeMs 的确定性换算)与 resolve.ts(`new Date(0)`,epoch 常量)各余 1 处——均为非墙钟换算,纯度门禁的 `new Date\(\s*\)`(无参墙钟)口径在 change/ 下已零命中;lifecycle.ts 墙钟已清除,白名单条目按约定保留给 B 移除
  - 范围:`checkChangeDoc` stage 分支;pattern `catch {}` → ERROR;`today` 必填
  - 单测:直接调用 core `validateChange`,传入手工构造的 `ChangeCheckConfig`(`change_id_pattern: '[unclosed'`,不经 `loadConfig`)→ 结果含 path `change-id`、消息以 `change_id.pattern is not a valid regular expression` 开头的 ERROR;不得经 CLI 路径测试(并行 change 合入后 CLI 在加载期即报错,到不了此分支);`finalizeChange`/`archiveChange` 未传 `today` 为类型错误(`tsc` 覆盖,无需运行时测试)
  - 完成判据:`rg -n "checkChangeDoc" packages apps tests` 仅剩(若保留)结构检查调用且无 `stage` 参数;`rg -n "new Date\\(" packages/core/src/change` 零命中;`just check` 通过

- [x] T9b: r40 死合约清理(design D8b)[blocked-by: T9]
  - 注:「archive 任务门禁」场景字节级断言由 T10 落步骤后验证(CLI 渲染文案逐行保持 `Archive blocked:` + `  - [ ] <task>` + Options 不变)
  - 范围:`archiveTaskGate` 去 ratio 参数、返回 `pendingLines`;`commands/change.ts` 删除 `:205-222` 内联任务门,改为打印 core 结果;`ChangeCheckConfig.min_completion_ratio` 与 `commands/validate.ts` 两处传参删除;`tests/unit/lifecycle.test.ts` 中 "ratio gate fires" 用例删除
  - 完成判据:`rg -n "min_completion_ratio|minCompletionRatio" packages/core/src/change packages/core/src/validation apps/cli/src` 零命中;既有「archive 任务门禁」场景 stderr 字节不变(`Archive blocked:` 行 + 逐项 + Options)

- [x] T10: lifecycle 验收补强(不含 T3/T4 已覆盖的 r46/r68)[blocked-by: T8]
  - BDD:实现 change-lifecycle.feature 中 r14/r15/r31/r34/r35/r36/r39/r40/r44/r45/r60/r69 新增场景步骤
  - 边界:只允许修改步骤文件与(若场景暴露真实缺陷)对应 core/CLI 最小修复;任何行为修复须在本任务注释记一行「场景 → 缺陷 → 修复文件」
  - 注(场景 → 缺陷 → 修复文件):「change new 覆盖与显式 verb」「template 未定义变量报错」→ CLI `change new` 的 `--dry-run` 早退:不渲染 `change_id.template`(未定义变量静默通过)且忽略显式 `--verb`(非模板路径不应用覆盖)→ 统一派生收口 `deriveNewId`(dry-run 与真实路径一致;模板错误上抛、`--verb` 覆盖生效),apps/cli/src/commands/change.ts;r60「未配置 template 时保持启发式派生不变」仅针对无 `--verb` 缺省路径,未回归
  - 注:其余 4 个红灯(start 门失败零写入、finalize 合并冲突、stage 单调、archive 门禁与 dry-run)均为步骤接线缺陷(新 When 与既有共享 Then 的 fixture 键/字段不一致、list --json 输出形状),纯测试侧修复,无产品行为变化
  - 完成判据:change-lifecycle.feature 全部 `@executable` 场景通过(36/36)

- [x] T11: validation 验收补强(不含 T2/T6/T8 已覆盖场景)[blocked-by: T8]
  - BDD:实现 validation.feature 中 r12/r47/r63/r64/r65 新增场景步骤;加强既有「种子缺陷被判 FAIL」Then 为逐 capability 断言
  - 注(场景 → 缺陷 → 修复文件):「种子缺陷逐类判定」→ `buildDuplicatesFor` 的 structurallyClean 守卫使混合缺陷仓库中重复 req_id 不触发 → 移除守卫(registry 基于已解析文档,v1「结构错误中止索引扫描」守卫不再必要),packages/core/src/validation/validate.ts
  - 注(场景 → 缺陷 → 修复文件):「输出模式与 strict 升级」→ bulk `--output human` 路径缺 Next steps 引导(r47 要求仅 human 模式含引导)→ 失败时按涉事条目类型补发,apps/cli/src/commands/validate.ts
  - 完成判据:validation.feature 全部 `@executable` 场景通过(23/23)

- [x] T12: 全门禁[blocked-by: T2, T3, T4, T6, T7, T9b, T10, T11]
  - 命令:`just qa`、`bun run golden:check`、`just pending-gate`、`bun run check:schema`、`CLI validate fix-lifecycle-validation-defects --strict --no-interactive`、`CLI review`
  - 注(context-index 遗产场景的测试侧 hermetification):`无索引时检索自愈`(r62,来自已归档 change close-v1-parity-gaps,非本 change 范围)在含 LLMAN_SDD_INDEX_CHAT_MODEL 的环境里会打真实 API(~7s)被 bun:test 5s 超时杀掉 → 场景 When 显式清空该 env 使查询恒走零 LLM 路径(r62 合同仅涉懒重建质量不涉检索),tests/bdd/steps/context-index.ts;产品行为未变
  - 完成判据:全部退出 0;pending = 0;`validate --all --strict` 若仅报他 spec STALE(scope 覆盖共享目录)按先例在本任务注释记偏差,不改他人 spec
  - 注(偏差,先例):`validate --all --strict --no-check` 仅 7 个他 spec(config-command/context-index/init-generators/monorepo-structure/peripheral-commands/review-freeze/spec-authoring)各 1 条 staleness 在该 change 的共享 scope(如 main.ts/core)被本分支代码触碰后变 STALE→--strict 升 ERROR,spec 未随动;按先例记偏差,不改他人 spec。本 change 自有 change-lifecycle/validation 两 spec 无 STALE(已随本分支 landing 更新)
  - 注(协调者 review 修复,2026-09-24):原判「harness 自指致 5 个场景必然失败」不成立。场景 → 缺陷 → 修复:本仓库 `validate --all --strict`(不带 --no-check)以 `bun test tests/bdd` 为 harness,子进程带 LLMAN_SDD_HARNESS_ACTIVE=1;临时仓库 CLI 子进程继承该守卫,占位符/batch-once/失败映射/no-check/check 无效提示 5 个场景误走嵌套跳过而失败 → `tests/bdd/steps/shared.ts` 的 `makeTempRepo().run` 剔除该变量(临时仓库是全新顶层上下文,其 run_command 为标记文件夹具,不回调本套件,无递归风险;显式测嵌套守卫的场景自行设置变量)。修复后 `LLMAN_SDD_HARNESS_ACTIVE=1 bun test tests/bdd` 连跑 3 次 123/123,`validate --all --strict` 仅余上条 7 个他 spec STALE,无 harness ERROR

<!-- 收口(change finalize)是流水线步骤而非任务,不列入本清单:finalize 的任务门要求全部任务已勾,列为任务会自相矛盾。 -->
