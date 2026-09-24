---
depends_on: []
needs_specs_change: true
branch: sdd/codify-gate-evidence-lessons
base_branch: main
base_sha: 7f4bfa751d5088c8d50a01d9d47f918c3279af2f
---

# 把 D/C/A/B 复盘教训固化进 skill 模板,并为仓库自带 skills 加新鲜度门禁

## Why

第一波(D/C/A)与第二波(B)四个 change 的实施与审查中,反复出现同几类「门禁看起来绿、其实没证明任何事」的问题。它们目前只写进了本仓库的 `llmanspec/AGENTS.md`(55254b2),但**使用 llman-sdd 的下游项目拿不到**——下游 agent 读的是 `init` 渲染出的 skills,而 apply/verify 模板对这些坑只字未提:

1. **门禁证据造假(非故意)**:A 的实现者把 harness 失败定性为「自指设计属性」,改用 `validate --no-check` 取得通过。实际根因是临时仓库子进程继承了嵌套守卫环境变量(环境泄漏)。apply 模板的自修复循环没有禁止这种「绕过即通过」。
2. **采信实现者报告**:verify 模板只要求「跑一个快速校验门禁」,没有要求审查者**亲自复跑**门禁、与实现者报告对账;A 的问题正是审查方复跑才发现的。
3. **基线测错位置**:B 的报告写「T0 STALE 基线 = 0 → T10 = 0」,但 T0 是在 main 上测的——staleness 按 `merge-base main HEAD` 计算,在 main 上恒为 0,对比不构成证据。
4. **编辑与验证并行**:审查方自己在同一批并行工具调用里编辑文件并跑测试,测试读到旧文件,产生假失败。
5. **重构后测试悄悄变少**:Q4 测试辅助合并中,批量替换险些让一个 step 文件因导入缺失而不注册——若未被 typecheck 拦住,门禁会「全绿」但用例数下降。门禁全绿不等于覆盖未减。

另有一处**本仓库自身**的缺口:提交在 `.agents/skills` 的 10 个 skill 停在 0.3.1,其中 7 个仍在教已删除的 `--no-interactive` / checkpoint / `change delta`(f77a279 手工刷新)。本仓库以狗粮模式运行,驱动实现的 agent 直接读这些文件;golden 只比对「模板渲染 vs 基线」,不比对「仓库已提交产物 vs 基线」,因此过期不会被任何门禁发现。

## What Changes

- **apply 模板(zh-Hans + en)**——自修复循环与验证节新增约束(逐条点名上述教训):
  - 门禁证据 MUST 来自真实 harness:MUST NOT 以 `--no-check` 取得「通过」;harness 失败 MUST 先查根因,MUST NOT 以「固有/自指属性」定性后绕过。
  - 编辑与验证 MUST 串行:验证 MUST 在编辑落盘后执行,MUST NOT 与编辑放在同一批并行工具调用中。
  - 前后对比类完成判据(计数/基线)MUST 在 change 分支上相对 merge-base 测量;在默认分支测得的值不构成证据。
  - 重构/批量替换类 task MUST 对比改动前后的测试用例数;门禁全绿但用例数下降视为失败。
- **verify 模板(zh-Hans + en)**:
  - 审查者 MUST 亲自复跑门禁(`validate --strict` 走真实 harness + 项目门禁),MUST NOT 采信实现者报告中的门禁结论;复跑结果与报告不符 → CRITICAL。
  - 发现门禁证据以 `--no-check` 取得 → CRITICAL。
  - 核对前后对比类证据的测量位置(见 apply 同条)。
- **propose 模板(zh-Hans + en)**:写 tasks.md 完成判据时,前后对比类判据 MUST 注明测量位置(change 分支 vs merge-base)。
- **模板对账门禁**:`tests/unit/template-guidance-parity.test.ts` 为上述三模板新增必含标记,双 locale 缺一即失败并报出模板与缺失标记。
- **仓库自带 skills 新鲜度门禁**:`golden:check` 追加一组比对——仓库已提交的 `.agents/skills` 与 golden 基线 `baseline/skills` 版本号归一化后 MUST 一致;失败时报出差异文件并提示运行 `init --update`。
- golden 基线重生;`init --update` 刷新 `.agents/skills`(本 change 自身即受新门禁约束);CHANGELOG 0.4.0 登记。

## Capabilities(预估)

- `init-generators`:r70(模板行为性指引对账)扩展必含标记陈述;新增一条 rN——仓库自带 skills 新鲜度门禁,并澄清 r70/r67 中「渲染产物与 golden 基线为下游,不重复设门」仅指**模板字面对账**不在下游重复,不排斥下游新鲜度比对。

## Impact

- 模板:`packages/core/templates/{zh-Hans,en}/skills/llman-sdd-{apply,verify,propose}.md`
- 门禁:`tests/unit/template-guidance-parity.test.ts`、`tests/golden/{check,lib}.ts`、`tests/bdd/steps/`(新 rN 的 `@executable` 步骤)
- 产物:`tests/golden/baseline/{skills,skills-en}/`、`.agents/skills/`
- 文档:`CHANGELOG.md`
- 下游项目:升级后 `init --update` 即获得新约束;无 CLI 行为变化、无 breaking。
