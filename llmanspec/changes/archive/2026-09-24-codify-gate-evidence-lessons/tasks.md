# Tasks

`CLI` = `bun apps/cli/src/main.ts`。测试接缝:沿用 `tests/unit/template-guidance-parity.test.ts`(必含标记)、`tests/golden/{check,lib}.ts`(golden:check)与 `tests/bdd/steps/` 既有 init-generators 步骤模块;不发明新 seam。本 change 自身即受 D1–D3 约束:门禁证据走真实 harness、前后对比在 change 分支测量、编辑与验证串行。

- [x] T0: 绑定与 Specs landing
  - 步骤:`CLI change start codify-gate-evidence-lessons`;`CLI spec next-req-id` 取新 rN;按 design D4 编辑 `llmanspec/specs/init-generators.feature`(r70 扩展 + 新 rN + 「不重复设门」限定)与 `monorepo-structure.feature`(r67 同一限定);新 rN 配两条 `@executable` 场景(D3 正向/反向);commit
  - 完成判据:`CLI show codify-gate-evidence-lessons --output json` 中 stage=full 且 specs-landed pass;`CLI validate --type spec init-generators --strict` 与 monorepo-structure 同样退出 0 结构项;新场景红灯(`No step definition`)系预期
  - 基线(在本分支上测,供 T5 对照):记录 `bun test tests/` 的用例数
  - 注:规划壳未跟踪致 `change start` 拒绝(要求干净树),改走 `git checkout -b` + 分支上提交规划壳 + `change attach`;新 rN = r80;show:stage=full、specs-landed pass;harness 仅 r80 两条新场景红灯(预期)。基线(本分支,Specs landing 后):376 tests = 374 pass + 2 fail(均为 r80 新场景)

- [x] T1: 三模板措辞落地(L1–L5,D1)[blocked-by: T0]
  - 步骤:按 design D1 修改 `packages/core/templates/{zh-Hans,en}/skills/llman-sdd-{apply,verify,propose}.md`;双 locale 同义
  - 完成判据:六个文件均含 D2 表中对应标记(`rg -n` 逐条可见);`bun test tests/unit/template-command-parity.test.ts` 通过(新措辞引用的命令/旗标真实存在)
  - 注:apply §4 新增第 3 项「编辑与验证串行」(原第 3 项顺延为 4),§5 在自修复循环前新增「门禁证据」三条;verify 硬约束新增「亲自复跑门禁」「`--no-check` 不是证据」,合约轴新增基线测量位置核对;propose 写 tasks.md 节追加测量位置句。command-parity 通过

- [x] T2: 必含标记门禁(D2)[blocked-by: T1]
  - 步骤:`template-guidance-parity.test.ts` 的 `REQUIRED_PER_FILE` 按 D2 表追加
  - 自证:任选一个新标记从 zh-Hans verify 模板临时删去 → `bun test tests/unit/template-guidance-parity.test.ts` 失败并报出模板与缺失标记;还原后通过(删改与重跑串行)
  - 完成判据:该测试通过;自证记录写入本 task 注
  - 注:自证——zh-Hans verify「亲自复跑门禁」改为「复跑」→ 失败并报 `[zh-Hans/skills/llman-sdd-verify.md] missing marker "Rerun the gates yourself|亲自复跑门禁"`;还原后通过。verify 键此前不存在,新建(无重复键)

- [x] T3: 仓库自带 skills 新鲜度门禁(L6,D3)[blocked-by: T0]
  - 步骤:`normalizeTree` / `diffTrees` 抽到 `tests/golden/lib.ts`(后者改为返回差异列表);`check.ts` 追加 `.agents/skills` 对 `baseline/skills` 比对(仅 `llman-sdd-` 前缀)与 config 一致性前置断言;补新 rN 两条场景的步骤定义
  - 自证:临时改动 `.agents/skills/llman-sdd-quick/SKILL.md` 一行 → `bun run golden:check` 退出 1,输出含该文件名、`changed` 与 `init --update` 提示;`git checkout` 还原后退出 0
  - 完成判据:`bun run golden:check` 退出 0 且输出三组计数;新场景转绿;反向场景不改动仓库文件(`git status` 干净)
  - 注:`tests/bdd/steps/init.ts` 原有第三份树比对副本(r19)一并改用 lib;config 一致性经 core `loadConfig` 解析。自证——quick 标题追加「(stale)」→ 退出 1,报 `changed: llman-sdd-quick/SKILL.md` + `run: ... init --update`;`git checkout` 后退出 0。另验证非前缀目录 `.agents/skills/my-custom/` 不参与比对(仍退出 0)。基线重生后(T4)门禁先如实报出 apply/propose/verify 三文件过期——即门禁的真实首次拦截

- [x] T4: 基线重生、产物刷新、CHANGELOG [blocked-by: T1, T3]
  - 步骤:重生 golden 基线(zh-Hans + en);`CLI init --update` 刷新 `.agents/skills`;CHANGELOG 0.4.0 条目登记「apply/verify/propose 模板新增门禁证据约束」与「仓库自带 skills 新鲜度门禁」
  - 完成判据:golden diff 与 T1 模板改动一一对应(人审);`.agents/skills` diff 与基线 diff 一致;`bun run golden:check` 退出 0
  - 注:基线 diff 恰为 {zh-Hans,en} × {apply,propose,verify} 六文件;`init --update` 仅改同三 skill(AGENTS.md 无变化);golden:check 输出 `skills: 10 files, skills-en: 10 files, .agents/skills: fresh`

- [x] T5: 全量验证 [blocked-by: T2, T4]
  - 完成判据(全部在本分支上测):`just qa` 退出 0;`CLI validate --all --strict` 退出 0(真实 harness,不带 `--no-check`);`CLI validate codify-gate-evidence-lessons --strict` 退出 0;`CLI review` 退出 0;`bun test tests/` 用例数 ≥ T0 基线 + 新增场景数
  - 注(本分支实测):`just qa` 退出 0;`bun test tests/` 376 pass 0 fail(T0 基线 374 + r80 两条新场景);`/tmp` 无 `llman*` 残留。勾选前 `review` 的唯一 CRITICAL 为本 task 未勾(validate 信号),`validate --strict` 同理——二者依赖全部任务已勾,故先勾选并提交,再于干净树复跑三项确认退出 0
