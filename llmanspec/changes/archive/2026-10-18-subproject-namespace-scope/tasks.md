# tasks

测试边界（seam）：既有 harness 复用——纯函数注入 IO（`tests/unit/roots.test.ts` 的
`ioFrom`）、BDD 子进程 `runCli` + `makeTempRepo`。双根 fixture 已存在
（`tests/bdd/steps/roots.ts` 的 `SUB = 'packages/tui'` / `seedSubRoot` / `seedRootCheck`）：
本 change 把这三个 helper 上提 `tests/bdd/steps/shared.ts`，新建
`tests/bdd/steps/scope-boundaries.ts` 并在 `tests/bdd/run.test.ts` 注册一行。不发明新边界。

实施期specs转写纪律：propose 落地的是裸规则；每个任务实施时把其覆盖的裸规则转写为可执行
`场景:`（嵌套 GWT）并补 step 绑定，转写完成后才可勾选该任务。

## t1 读侧与 project 的实例根选项补齐（cli）

- [x] `context` 与 `index rebuild` 声明 `--directory <path>`（当前只读取未声明）；`project` 补
      `--directory` 声明并接入 `resolveInstanceRoot`：三者解析起点 = 显式 `--directory` 或 cwd，
      向上取最近有效实例；单根输出与今天逐字节一致
- [x] BDD：`--directory` 指向子根时三个命令命中子根实例（注册表 / 上下文 / 索引各自读子根）
- [x] 转写 `scope-boundaries` r115（根限定一律 `--directory`）为可执行场景并绑定步骤

## t2 change / archive 接入根发现（change-lifecycle + cli）

- [blocked-by: t1]
- [x] `change`（new / start / next-id / diff / finalize）与 `archive`（freeze / thaw）经同一
      根发现算子解析实例根：子目录 cwd 归位最近实例根，不再就地新建 `llmanspec/changes/`；
      向上无有效实例 → `no llmanspec root at or above <path>`（exit 1）
- [x] BDD（双根 fixture）：子目录 cwd 下 `change new` 落在最近实例根；无实例目录下 `change new`
      报域错误且不落盘；单根行为零漂移（另含 `change next-id` per-root 清点与
      `archive freeze`/`thaw` 归位共 6 个场景）
- [x] 转写 change-lifecycle 新条款（r118）为可执行场景并绑定步骤
- [x] `migrations/v0.9-v0.10/README.md` 追加破坏面条目（与「只读命令接入根发现」并列），
      含现状、升级步骤与自检（`llman-sdd validate --all --strict`）

## t3 跨根同号观测段（validation + core）

- [blocked-by: t2]
- [x] `validate --all-roots` 聚合覆盖 change id 粒度（今天只跑 specs 粒度）并产出
      `crossRootCollisions[]`：每条 `{namespace: spec|req|change, value, roots[]}`，确定性排序
      （先 namespace 后 value，根列表按根相对路径序）；`summary.crossRootCollisions` 给计数
- [x] 单根模式 MUST NOT 产出该字段（不是空数组）——纯函数单测 + 单根输出逐字节回归锁
      （口径：change id 粒度落在**观测段**覆盖，聚合**校验**仍只跑 specs——design #8「观测
      覆盖面」；若聚合改跑 change 校验，单根 `--all-roots` 输出必漂移，违反 r91 铁律）
- [x] human 形态在观测段尾附处置指引行（指向 `--directory`）；machine 形态不带该行
- [x] 退出码不受观测段影响（撞号合法，仍由各根校验结果决定）
- [x] 转写 `scope-boundaries` r114 为可执行场景并绑定步骤

## t4 跨根写入约束的验证与守卫（scope-boundaries + 各写面）

- [blocked-by: t2]
- [x] BDD（双根 fixture）三类写面各一场景，断言另一根文件字节零改动：spec 侧
      `project dedupe-req-ids`、change 侧 `change new` 与 `change finalize` 改名、archive 侧
      `archive freeze`
- [x] 两处豁免以场景固化：`init --update` 扫块刷新其他根托管块（既有多根写先例）、用户显式
      传入的路径参数（`spec migrate-native <paths>`）
- [x] 若任一场景实测发现越根写入 → 在「默认目标解析」层补统一路径守卫后再转绿；未发现违约
      则不引入守卫（五场景实测均零越根写入：三类写面以 `llmanspec/` 树摘要逐字节比对，
      故不引入守卫）
- [x] 转写 `scope-boundaries` r116 为可执行场景并绑定步骤

## t5 单一归属门不回归（validation 清理 + bdd）

- [x] 反写 `tests/bdd/steps/roots.ts` 中三个断言「报 single-ownership 错误」的孤儿步骤：改为
      断言根 specs `# scope:` 覆盖到已带 `llmanspec/` 的子包目录时 `validate --specs` 仍绿、
      无 `single-ownership` issue（含非空断言：该 spec 确实被校验过）
- [x] 转写 `scope-boundaries` r117（单一归属门不回归）为可执行场景并绑定步骤

## t6 数字分配器符号同源（core + unit）

- [x] `packages/core/src/report/specHelpers.ts` 的 `nextReqId` 改调
      `packages/core/src/util/nextNumber.ts` 原语；单测断言与 `nextNumber(maxUsedNumber(used))`
      同源（值等价、零输出变化）
- [x] 转写 `scope-boundaries` r113 中可程序化判定的部分（per-root 域不阻断）为可执行场景并绑定

## t7 验证后修订（双轴评审 CRITICAL 回修 + 回归测试）

- [blocked-by: t1, t3]
- [x] 契约/标准双轴 CRITICAL：`validate --specs --directory <path>` 限定失效——`resolveRootSpecsDir`
      缺省起点取 `process.cwd()` 而非 `io.root`，`validate` 单根分支只换 `root` 不换 `io`，聚合循环
      又以 `undefined` 起点逐根读注册表，三者叠加使限定子根仍判启动根注册表。修复：`CliIo` 增
      必填 `root`（r115 文档随附）、缺省起点改 `io.root`、单根分支改走 `reRootContext`、聚合逐根以
      `root.rootDir` 读条目（并摘掉 `specV1Items` 的 `ctx` 形参与危险的 `entries` 缺省）
- [x] 契约/标准双轴 CRITICAL：`show` 文本面漏传 `options.directory`——`io/git/root` 已换而 `specsDir`
      未换，同一 change 出现 JSON `validate` 门通过、human 面 `✗ validate`（`Gates: 1/6`）的分歧。
      修复方向：规格目录必须从解析出的实例根派生（终态见 t8——初版
      `resolveRootSpecsDirTolerant(ctx, options.directory)` 仍带启动相对串缺陷，第二轮评审证伪后收敛）
- [x] WARNING（r109）：`change` 编号清点在链接 worktree 缺实例目录时裸 `lstatSync` 泄漏
      `ENOENT: ... lstat '<worktree>/llmanspec'`。修复：`harvestIo` 的 `listDir`/`isDirectory`
      对「此根不存在」语义归为 `[]`/`false`，核心 `harvestAcrossWorktrees` 无需改动
      （吞错范围第二轮收窄为仅 ENOENT/ENOTDIR，见 t8）
- [x] 删除随修复失去唯一调用点的死代码 `resolveInstanceRootOrThrow`
- [x] S1 收敛归档条目 id 提取：`changeCheck` 三处手写 `slice(11)` / `.yaml` 剥离统一经
      `archivedEntryId`（组合既有 `util/datedId` 原语），行为逐字节等价（边缘差异 `2026-02-02-.yaml`
      第二轮修正，见 t8）
- [x] 回归测试（新增/加强 6 处场景）：r115 `validate` 限定（仓库内限定子根 / 仓库外限定根）、
      r115 `show` 双输出面 gate 逐项一致、r91 嵌套目录聚合逐根读各自注册表且零伪造撞号、
      r118 worktree 缺实例目录编号清点不泄漏 ENOENT、r113 逐根分组条目加强、r116 显式路径豁免补
      子根 `llmanspec` 树摘要（原断言只看单文件存在性）
- [x] 回归测试强度自检：以 `git stash push` 回退当时未提交的 5 个 `apps/cli` 源码文件后重跑，
      4 个新场景修前必红；r113 加强断言在仓库根启动时因注册表相对路径巧合修前亦绿，其判别性
      由 r91 嵌套场景承担（第二轮 stash 差分见 t8）
- [x] r91 措辞澄清（与 Q8=B 的观测段口径一致）：「聚合覆盖面 MUST 含 change id 粒度」改为
      「聚合报告的观测覆盖面 MUST 含 change id 粒度（逐根结构校验仍为 specs 粒度，change 粒度经
      观测段呈现）」
- [x] S2（评估后不采纳，记债）：`config` / `spec` / `validate` 共 6 处内联 `--directory` 声明仍在
      命令链中，改用 `addSpecDirOption` 需先把命令链改为 `const` 接收；r109 声明面已有单测兜底，
      留作后续清理

## t8 第二轮双轴评审回修（相对 --directory 锚定 + 断言判别性 + 文档对齐）

- [blocked-by: t7]
- [x] 契约轴 CRITICAL C1：`validate --all-roots --directory <相对路径>` 报假域错误（绝对路径正常）——
      `discoverRoots` 跟随起点形态返回相对 `rootDir`，`makeIo(rootDir)` 对相对串二次锚定使
      `resolveInstanceRoot` 落空。修复：起点在 CLI 边界经 `resolve()` 绝对化（`--directory` 与
      git toplevel 两源），循环内 `rootDir` 同样绝对化后再构造 `rootCtx`/读条目/算 `label`
- [x] 契约轴 CRITICAL C3：单段相对 `--directory`（如 `packages`）与 `--directory ..` 无法升到
      祖先实例根——核心向上发现把单段相对名截断为空父串。修复：`resolveCommandRoot` 以
      `resolve(given)` 绝对化后再交给发现算子，错误消息保留用户字面拼写
- [x] 标准轴 CRITICAL C2：`show <change> --directory <相对路径>` 校验门假通过——
      `resolveRootSpecsDirTolerant(ctx, options.directory)` 返回启动相对串，被根锚 `rctx.io`
      二次拼接成不存在的路径，注册表读空使 `validateOk` 空真。修复：宽容 helper 只从
      `ctx.io` 派生（`resolveRootSpecsDir(undefined, ctx.io)`），`resolveRootSpecsDir` 的
      非恒等分支以 `io.root` 锚定绝对化，`show` 两输出面共用同一 `deps` 常量
- [x] 标准轴 W1：`harvestIo` 全量吞错使 EACCES 下核心 `cannot list <dir>` 告警消失——收窄为
      仅 ENOENT/ENOTDIR 静默，其余上抛（实测：chmod 000 的 worktree 恢复告警行，缺实例
      worktree 仍静默跳过）
- [x] 标准轴 W3：`archivedEntryId` 的 `??` 回退链使 `2026-02-02-.yaml` 产出 `.yaml`（前代为
      空串跳过）——卡片形态先行判空后，对剥去 `.yaml` 后缀的名字再走目录文法
- [x] 标准轴 W2：r113 逐根分组断言的行内注释夸大判别性（仓库根启动时修前亦绿）——改为如实
      陈述其为回归护栏，判别性由 r91 嵌套 cwd 场景承担
- [x] 断言判别性反转：`show` 双输出面场景的夹具原为「根失效而子根有效」（两面读空注册表时
      恰好仍通过）——反转为「子根失效而根有效」，validate 门 MUST 判红，读空/误读根注册表
      两个错误方向都会给出相反结论
- [x] 新增场景：r115 冒号形态复合标识符跨 `show`/`validate` 两命令拒绝解析；r115 相对与绝对
      `--directory` 等价（聚合 JSON 全等 + `list` 单段相对名升祖先实例根输出全等）；r109 `show`
      的 changes 豁免面（无有效实例但含 `llmanspec/changes/<id>` 时缺省读出、显式
      `--directory` 与 `list` 报域错误）
- [x] 规格与文档对齐：cli.feature r109 补 `show` change 面豁免条款与场景；migrations 迁移 4
      破坏面补相对/绝对等价说明与 `show <id>` 缺省宽容面（含豁免出处）
- [x] 回归测试强度自检（第二轮）：`git stash push` 回退 3 个源码文件（cli-shared/validate/show）
      后重跑——相对等价与双输出面判红两个场景修前必红；冒号场景修前亦绿（负向解析锁，
      非本轮回归判别器，如实记录）
