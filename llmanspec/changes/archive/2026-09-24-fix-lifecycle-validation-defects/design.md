# Design: 生命周期与校验缺陷修复

> **人读摘要**
> - **结论**:3 条确定性 bug + 1 处合约矛盾(r13↔r48)+ 1 处文案↔模板矛盾(r63)+ 8 项 slop,统一在 change/validation 两域修复;harness 执行按 v1 语义恢复。
> - **风险**:① 本仓库 `validate --all` 将真实跑 `bun test tests/bdd`(约 10s),BDD 内部再调 validate 需嵌套守卫防递归;② 18 处 BDD/集成测试调用 validate,带 `bdd:` 段的夹具会开始执行 harness;③ `commitCount` 数值修正属可见变化。
> - **待决策**:无(关键取舍已由用户定案:恢复 r48 执行 / binding 写入新 worktree)。

---

## 1. 问题清单(证据)

| # | 类别 | 证据 | 现象 |
|---|---|---|---|
| A1 | bug | `packages/core/src/validation/changeCheck.ts:190-193` | `!io.exists(dir.replace(/\/[^/]+\/$/u, '/archive/'))` 在任何含 `changes/archive/` 的仓库恒 false → unknown 依赖永不报错;`tests/unit/frontmatter.test.ts` 夹具不建 archive/ 故单测绿 |
| A2 | bug / 定案违背 | `packages/core/src/change/lifecycle.ts:450-455` | `rev-list --count ${baseSha}...${branch}`:① 用审计字段 `base_sha` 算范围(违背 AGENTS「仅审计」);② `...` 是对称差,base 前进后计数含 base 侧新提交 |
| A3 | 不一致 | `packages/core/src/change/lifecycle.ts:172-186` | `git worktree add` 后用发起检出的 `io` 写 binding → binding 落在发起检出(常为 main,产生脏树),新 worktree 无 binding;经典路径是 `switch -c` 后写,binding 在特性分支 |
| A4 | 合约矛盾 | `llmanspec/specs/validation.feature` r13 vs r48;`tests/bdd/steps/validation.ts:130-134` | r13 禁止执行,r48 要求执行;代码不执行;r48 Then 只断言 exit 0(假绿);`config/schema.ts:55-59` 与 `llmanspec/config.yaml` 注释仍宣称 batch-once 执行 |
| A5 | 文案↔模板矛盾 | `changeCheck.ts:257`;r63 文本 | WARNING 说「apply only when readyToImplement=true」,而模板(aa95260 起)apply 入门 = specs-landed 门,readyToImplement 是 verify/finalize 完成信号 |
| A6 | 重复实现 | `change/frontmatter.ts:14-21` vs `:33-37` | `splitFrontmatter` 要求 `\n---\n` 闭合,`extractFrontmatter` 只要 `\n---`;EOF 闭合无换行时依赖可读而 binding 读不到 |
| A7 | 重复实现 + bug 风险 | `changeCheck.ts:246-249`(全文匹配两次)、`report/show.ts:66-70`、两处 `touched.includes('llmanspec/specs/')` | 正文一行 `needs_specs_change: false` 可翻转判定;子串匹配会被 `foo/llmanspec/specs/x` 误命中 |
| A8 | 遗留双口径 | `changeCheck.ts:52-104`(`checkChangeDoc` 序数 stage 门,注释 "Legacy pure gate…kept for existing callers/tests") vs `:279-291` | 同一 `--stage` 两种判法;CLI 只用后者 |
| A9 | 输出卫生 | `lifecycle.ts:218` `(r111)`;`changeCheck.ts:271` `(sdd-workflow r29; …)`;`validation/validate.ts:66` `(spec-format r133)`;`validate.ts:82` `.toon document`;`apps/cli/src/commands/validate.ts:173` `ISON` | 内部编号与已移除格式泄漏到用户输出 |
| A10 | 措辞不一 | start/attach `detached HEAD is not allowed for change binding` vs archive `detached HEAD — cannot archive`;finalize `finalize must run on the bound branch` vs archive `archive must run on attached branch` | 同一门两套文案,难以断言与 agent 匹配 |
| A11 | 吞异常 | `changeCheck.ts:274-276` `catch { /* compile already validated at load; ignore */ }` | `loadCliConfigUnchecked` 路径不编译 pattern,非法正则被静默忽略 |
| A12 | 时钟未注入 | `lifecycle.ts:373` `today ?? new Date()` | 归档日期依赖墙钟,测试需自行传参才确定 |

## 2. 决策

### D1 依赖引用解析(r73)

- 判定函数 `resolveChangeRef(changesRoot, id, io): 'active' | 'archived' | 'unknown'`(`validation/changeCheck.ts` 内部,不进 barrel):
  - `active`:`<changesRoot>/<id>/proposal.md` 存在(与 CLI 的 change 扫描同口径:活跃 change 可嵌套,按叶子目录名匹配——复用 `collect.ts` 已有的扫描而非再写一套遍历)。
  - `archived`:`<changesRoot>/archive/` 下存在目录名匹配 `^\d{4}-\d{2}-\d{2}-<id>$` 的条目(精确匹配,**不再**用 `endsWith('-'+id)`——后者会让 `other` 误命中 `2026-01-01-the-other`)。
  - 其余 `unknown` → ERROR,消息 `proposal.md <key> references unknown change: <id>`(保持现文案)。
- `archived` 不产出任何 issue(依赖已满足);`blocks` 与 `depends_on` 同一判定。
- `archive/` 目录不存在时 `listDir` 返回空,不得抛错。

### D2 frontmatter 单一解析口径

- `change/frontmatter.ts` 仅保留一个切分器 `splitFrontmatter(text)`:开头必须是 `---\n`(offset 0);闭合为**独占一行**的 `---`,其后是 `\n` 或 EOF。读路径(`extractFrontmatter`、`readBinding`、依赖解析、`needs_specs_change`)与写路径(`writeBinding`)全部经它;`writeBinding` 输出规范化为 `---\n…\n---\n`。
- 新增 `readNeedsSpecsChange(frontmatter: string | null): boolean`(缺省 true;只认 frontmatter 内 `needs_specs_change: true|false`)与 `specsLanded(git, binding): boolean`(`diff --name-only <base_branch>...<branch>` 的**逐行** `startsWith('llmanspec/specs/')`)。`changeCheck.ts` 与 `report/show.ts` 均改调这两个函数,删除各自的内联正则与子串判断。
- 两函数放 `change/frontmatter.ts`(同模块内导入,不新增跨模块边,不触碰 `index.ts`——见 §7 所有权)。

### D3 diff 计数(r46 改写)

- `commitCount` = `git rev-list --count <mb>..<branch>`,`<mb>` = `git merge-base <base_branch> <branch>`(`base_branch` 缺键回退 `defaultBranch`)。
- JSON `base` 字段**保留**存储的 `base_sha`(v1 输出形状与 `--json` 字节兼容定案),但 MUST NOT 参与计数——与 v1 `effective_range_base` 语义一致(v1 源:`../llman.old-rs-impl-sdd/crates/llman-sdd/src/sdd/change/git_native.rs:393-405`)。
- 人读 `change diff` 维持 `diff <base_branch>...<branch>`(已正确)。

### D4 worktree 绑定落点(r68 改写)

- `startChange` 在 `worktree add` 成功后,以 `ioAt(io, worktreePath)`(以 worktree 根为基的 FsIo 视图;若现无此 helper 则在 `lifecycle.ts` 内以路径前缀包装现有 FsIo,不新增端口)读写 `<worktree>/llmanspec/changes/<id>/proposal.md`。
- 前提:proposal 必须已在 HEAD 中提交(干净树门已保证未跟踪/未提交的 proposal 会被拒)。worktree 内 proposal 不存在时 MUST 报错,并以 `git worktree remove --force <path>` + `git branch -D <branch>` 回滚,保证「零写入」语义。
- 发起检出 MUST 字节不变(`git status --porcelain` 为空、proposal 内容不变)。
- `base_sha` 在 worktree 内计算(`merge-base HEAD <base_branch>`,HEAD = 新分支)。

### D5 harness 执行语义(r13 改写 + r48 落实)

**触发矩阵**(`configured` = `bdd.run_command` 为非空字符串;`framework` 派生缺省命令**不**参与执行——它只供模板变量):

| 条件 | 行为 |
|---|---|
| 非 `validate` 命令(review 的 validate sweep、finalize/archive 预合并 sweep、show 的 validate 门) | MUST NOT 执行 |
| `validate` 且目标集不含任何 spec(纯 change 校验) | 不执行 |
| `validate --no-check` | 不执行,无 issue |
| 环境变量 `LLMAN_SDD_HARNESS_ACTIVE=1`(嵌套调用) | 不执行,每个 spec item 追加 INFO `bdd harness skipped: nested invocation` |
| `configured` 且上述均不成立(`--check` 给与不给等价) | 执行 |
| 未 `configured` 且显式 `--check` | 不执行,追加一条 INFO `--check has no effect: bdd.run_command is not configured`(item 级,附在第一个 spec item) |

**占位符展开**(v2 布局):对每个待校验 capability,`{feature_path}` = 该 capability 主 `.feature` 文件的仓库根相对路径(扁平 `llmanspec/specs/<cap>.feature` 或目录式 `llmanspec/specs/<cap>/<cap>.feature`);`{feature_dir}` = 其父目录;`{feature_name}` = capability id。替换为纯文本替换,不做 shell 转义(capability id 已受 kebab 约束)。

**batch-once**:以「展开后的命令串」为键缓存结果;同一 validate 进程内同键至多执行一次。无占位符时所有 capability 同键 → 整批一次。

**执行方式**:核心定义端口 `HarnessRunner`(`ports.ts`):`run(command: string, cwd: string): { exitCode: number | null; output: string; spawnError?: string }`;CLI 适配器(`apps/cli/src/harness.ts`)以 `node:child_process.spawnSync('sh', ['-c', command], { cwd, env: { ...process.env, LLMAN_SDD_HARNESS_ACTIVE: '1' }, encoding: 'utf8' })` 实现,stdout/stderr 合并截取尾部;cwd = 项目根(`llmanspec/` 的父目录)。Windows 不在本变更范围(`sh` 不可用时走 spawnError 分支报 ERROR)。首次执行前向 stderr 输出一行 `running bdd harness: <expanded> (use --no-check to skip)`(每进程至多一次)。

**纯度约束**:core harness 模块 MUST NOT 读取 `process.env`、MUST NOT 调用墙钟——并行的 harden-core-purity-config 把 `process.*` 与无参 `Date` 纳入纯度门禁。守卫变量在 CLI `commands/validate.ts` 读取,以 `{ nested: boolean, check: 'default' | 'on' | 'off', runner: HarnessRunner | undefined }` 形式传入 core;stderr 提示行也由 CLI 输出(core 返回「是否已执行」信号)。

**结果映射**(issue 附在对应 spec item 上,沿用 v1 per-item 语义):

| 结果 | level | message |
|---|---|---|
| exit 0 | INFO | `bdd harness passed: <expanded>` |
| exit ≠ 0 | ERROR | `bdd harness failed (exit <n>): <expanded>: <输出尾部至多 200 字符>` |
| 缓存命中且原结果失败 | ERROR | `bdd harness failed (cached result of <expanded>): <原摘要>` |
| 缓存命中且原结果成功 | INFO | `bdd harness passed (cached): <expanded>` |
| spawn 失败 | ERROR | `bdd harness could not start: <expanded>: <error>` |

- INFO 受 r32 缺省过滤;ERROR 使该 capability `FAIL`,进而退出码非零。
- `--json` 形状不变(issues 仍是 `{level,path,message}`);`path` = capability 的 spec 路径(与既有 spec issue 同口径)。
- CLI help:`--check` → `run the bdd harness (default when bdd.run_command is configured)`;`--no-check` → `skip the bdd harness`。
- 模板:validate/verify/explore/propose 四个 skill(zh-Hans + en)中「validate 不执行 harness / --check 为 no-op」表述改为「配置 run_command 时 validate 缺省执行 harness,`--no-check` 跳过」;`tests/unit/template-guidance-parity.test.ts` 若含相关禁用模式同步更新;golden 基线再生成。

**本仓库影响与防递归**:`just qa` 启动的 `bun test` 进程未设守卫变量,其中 BDD 步骤以子进程调用 validate 时——若临时仓库带 `bdd:` 段会执行该临时仓库的 run_command;在仓库根调用 `validate --all/--specs` 的步骤若存在,会触发 `bun test tests/bdd` 并由子进程继承守卫变量终止递归。实现者 MUST 审计全部 18 处 validate 调用(`rg -n "'validate'" tests/bdd/steps tests/integration`),对不以 harness 为测试对象的调用显式加 `--no-check`,对临时仓库夹具中的 `run_command` 换成确定性命令(`true` / 写标记文件)。

### D6 输出卫生(r74)

- 用户可见字符串(`throw new LifecycleError(...)`、`push(level, path, message)`、CLI `console.log/error`)MUST NOT 匹配 `/\((?:[a-z-]+ )?r\d+[^)]*\)/u` 或 `/\b(?:sdd-workflow|spec-format|v1) r\d+\b/u`。代码注释不受此约束(注释清理归 slop 批次,不在本变更强制)。
- 具体改动:`lifecycle.ts:218` 去 `(r111)`;`changeCheck.ts:271` 改为 `Change id '<id>' does not match change_id.pattern '<p>' (active changes only; archived changes are not re-checked).`;`validate.ts:66` 去 `(spec-format r133)`;`validate.ts:82` 改为 `Spec valid_scope must not be empty (declare it in the "# scope:" header comment).`;CLI `ISON` → 删除该行(`purpose`/`requirements` 属已移除的 JSON spec 格式,v2 规范是 `# purpose:` 头注释),替换为 `Ensure each .feature starts with "# capability:", "# purpose:" and "# scope:" header comments`。
- git 门文案族统一(`lifecycle.ts` 内私有常量/函数):
  - `detachedHead(cmd)` → `` `${cmd}` refuses a detached HEAD; check out a branch first ``
  - `notOnBoundBranch(cmd, bound, current)` → `` `${cmd}` must run on the bound branch `${bound}` (current: `${current}`) ``
  - `onDefaultBranch(cmd, def)` → `` `${cmd}` must not run on the default branch `${def}` ``;attach 额外追加 `; create or switch to a feature branch, or use \`change start\``(r31 要求含建议动作)
  - `dirtyTree(cmd)` → `` `${cmd}` requires a clean working tree ``
  - start/attach/finalize/archive 全部改用;BDD 断言以 `must run on the bound branch` / `refuses a detached HEAD` 等稳定子串匹配。

### D7 r63 文案与门语义对齐

- WARNING 尾句由 `apply only when … readyToImplement=true (llman-sdd-apply)` 改为 `start llman-sdd-apply once the specs-landed gate passes (see \`llman-sdd show <id>\` gateChecks)`;r63 规格文本同步(见 Specs landing)。`readyToImplement` 仍是 show 的全门完成信号,语义不变。

### D8 删除遗留与吞异常

- 删除 `checkChangeDoc` 的 `stage` 参数与序数比较分支;保留其结构检查(若仍被调用)或整体删除(若删 stage 分支后无调用方)。`tests/unit/validation.test.ts` 中针对该分支的用例改写为经 `validateChange` 断言。
- `changeCheck.ts` 的 pattern `try/catch {}`:编译失败时 push ERROR `change_id.pattern is not a valid regular expression: <msg>`(path `change-id`),不再静默。并行的 harden-core-purity-config 把编译前移到 `loadConfig` 后,CLI 路径到不了此分支;此处保留为 core API 的防御(调用方可不经 `loadConfig` 直接构造 `ChangeCheckConfig`),测试因此直接调用 `validateChange`。
- archive/finalize:`opts.today` 改为必填(`today: string`),CLI 侧传 `new Date().toISOString().slice(0, 10)`;core 内不再读墙钟。

### D8b r40 死合约清理:min_completion_ratio 与重复任务门

- 证据:`archiveTaskGate`(`lifecycle.ts`)在存在未勾任务时无条件阻断,完成率 < 1 必然存在未勾任务 → ratio 门**不可达**;validate 侧 `changeV1Items`(`apps/cli/src/commands/validate.ts:102`)把 `min_completion_ratio` 传入 `validateChange`,但后者从不读取(只有遗留 `checkChangeDoc` 读);`apps/cli/src/commands/change.ts:205-222` 在调用 core 前**重复实现**了一遍未勾任务阻断与输出。
- 决策:r40 删除 ratio 条款;core `archiveTaskGate` 删除 ratio 参数并返回 `pendingLines`,CLI 仅负责打印(`Archive blocked: N unchecked task(s).` + 逐项 + Options 两行,文案字节不变),删除 CLI 内联 `existsSync/readFileSync/parseTaskCheckboxes` 重复逻辑;`ChangeCheckConfig.min_completion_ratio` 与两处 CLI 传参删除。
- config 字段 `archive.min_completion_ratio` 的 schema/artifact 删除**不在本变更**(`config/**` 第一波归 harden-core-purity-config,且删除字段会使本分支外的引用编译失败),登记给第二波 align-report-cli-surface;过渡期该字段被接受但无效果。
- archive `--dry-run` 的日期在 CLI 边界取墙钟(允许),core 不取。

### D9 可执行验收策略

- seam 全部复用既有:CLI 子进程 + `makeTempRepo`(`tests/bdd/steps/shared.ts`)、`tests/bdd/steps/{validation,lifecycle,archive}.ts` 现有 Given;不新增 seam。
- harness 断言手法:夹具 `run_command` 写标记文件,如 `printf '%s\n' {feature_name} >> .harness.log`(逐项)/ `echo run >> .harness.log`(batch-once)/ `exit 3`(失败);Then 读 `.harness.log` 行集合断言,**不**以退出码代理。
- 所有新增 Then MUST 直接断言场景文本中的每一个事实(退出码、stdout/stderr 子串、文件内容、git 状态),禁止 exit-0 代理;一个 Then 断言多个事实时逐一 `throw` 具名错误。

## 3. 规格落地摘要(Specs landing)

- validation:改写 r13、r48、r63;新增 r73、r74;新增 `@executable`:r12(逐类种子缺陷)、r13(缺省执行 / --no-check / 嵌套守卫)、r48(逐项展开 / batch-once / 失败映射)、r47(--strict 升级 / 缺省 TOON / --type 消歧 / Next steps 仅 human)、r63(--strict)、r64(archive 免检)、r65(悬空 @req ERROR)、r73、r74;删除旧的假绿 r48 场景。
- change-lifecycle:改写 r46、r68;新增 `@executable`:r14(门失败零写入 + base_sha)、r15(非绑定分支拒绝 / 冲突 best-effort)、r31(detached + 文案)、r34(单调推断全阶段)、r35(纯前导数字不计)、r36(id 与 --from 互斥)、r39(门禁 + --dry-run)、r40(min_completion_ratio + --force)、r44(new --force / --verb)、r45(前缀取值序 / sweep 失败中止 / --no-check / method 取值序)、r46(--export-patch + base_sha 无关)、r60(未定义变量报错)、r68(binding 在 worktree + 发起检出不变 + 路径已存在)、r69(目标未被持有保持现行)。

## 4. 非目标

- 不做注释层面的需求号清理(归 slop 批次);不改 `review` 与 `show` 的输出面(第二波 `align-report-cli-surface`)。
- 不实现 Windows harness;不引入 harness 超时(v1 亦无)。
- 不改 `defaultBranch` 与 staleness 的 `defaultBranchNameFn` 双口径(有意保留,见 `git/spawnGit.ts:57-59`)。

## 5. 风险与回滚

| 风险 | 缓解 |
|---|---|
| harness 递归 / qa 变慢 | D5 守卫变量 + 测试调用显式 `--no-check`;门禁 T9 以 `just qa` 总耗时 ≤ 基线 +30s 验收 |
| 既有 golden 基线漂移 | 仅四个 skill 的 harness 表述变化;golden 再生成后人工 diff 只含该表述 |
| `commitCount` 数值变化影响脚本 | 字段集不变;CHANGELOG 记为修正 |
| worktree 回滚失败残留 | D4 回滚步骤有 BDD 覆盖(路径已存在 / proposal 缺失两路径断言零残留) |

## 6. 验证总表(映射 tasks)

| 验收点 | 命令 | 期望 |
|---|---|---|
| 本 change 结构 | `bun apps/cli/src/main.ts validate fix-lifecycle-validation-defects --strict --no-interactive` | 退出 0 |
| 两份 spec 结构 | `bun apps/cli/src/main.ts validate validation --type spec --strict` 与 `… change-lifecycle …` | 退出 0 |
| BDD 全绿 | `bun test tests/bdd` | 0 fail;新增场景全部执行(无 `No step definition`) |
| 全门禁 | `just qa && bun run golden:check && just pending-gate` | 全部退出 0;pending = 0 |
| 输出卫生 | `rg -n "\\((?:[a-z-]+ )?r[0-9]+[^)]*\\)" packages/core/src/change packages/core/src/validation apps/cli/src/commands/change.ts apps/cli/src/commands/validate.ts -g '!*.test.ts' --pcre2` 仅命中注释行 | 字符串字面量零命中 |

## 7. 第一波协作约束

**req id 号段**(全局 rN 注册表在并行分支上不可见,禁止各自调用 `spec next-req-id`):

| change | 号段 |
|---|---|
| fix-lifecycle-validation-defects(本变更) | r73–r79 |
| harden-core-purity-config | r80–r84 |
| align-docs-and-gates | r85–r89 |
| align-report-cli-surface(第二波) | r90 起 |

**文件所有权**(第一波内独占;未列出文件本变更不得修改):

- `packages/core/src/change/**`、`packages/core/src/validation/**`、`packages/core/src/git/**`、`packages/core/src/ports.ts`、`packages/core/src/report/show.ts`(仅 D2 调用替换)
- `apps/cli/src/commands/{validate,change}.ts`、新文件 `apps/cli/src/harness.ts`
- `tests/bdd/steps/{validation,lifecycle,archive}.ts`、`tests/unit/{validation,lifecycle,frontmatter}.test.ts`、`tests/integration/lifecycle.test.ts`、`tests/unit/template-guidance-parity.test.ts`
- `packages/core/templates/{zh-Hans,en}/skills/llman-sdd-{validate,verify,explore,propose}.md`、`tests/golden/baseline/**`(再生成)
- `llmanspec/specs/{validation,change-lifecycle}.feature`
- **跨变更约束**:harden-core-purity-config 的纯度门禁曾将 `change/lifecycle.ts` 列入过渡白名单;本变更 T9 清除该文件的墙钟调用后,协调者 review 时即删除该条目(不再等第二波)。本变更新增的 core 代码不得依赖任何白名单。
- **禁止触碰**:`packages/core/src/config/**`、`llmanspec/config.yaml`、`AGENTS.md`、`llmanspec/AGENTS.md`。`packages/core/src/index.ts` 仅允许追加 harness 公共导出(`runHarnessForSpecs` 及其类型,供 CLI 适配器使用);`HarnessRunner` 端口定义在 `validation/harness.ts` 而非 `ports.ts`,以免给 validation 模块新增跨模块边(r72)。其余新函数保持模块内部。
