# tasks

- [x] T1: r2 对账先行——`tests/bdd/assert/quality-gates.ts` 期望集加 `check:stc`（qa script 字符串、justfile qa 体、ci.yml run 步三处断言），先红 `bun tests/bdd/assert/quality-gates.ts` `[blocked-by: ]`
- [x] T2: 接线四处——package.json 加 devDependency `@daimonia/stc` + `check:stc` script + qa 字符串扩段；justfile qa recipe 加行；ci.yml test job 加 `bun run check:stc`；跑 `bun install` 锁版本；quality-gates 断言转绿 `[blocked-by: T1]`
- [x] T3: check-stc 实现与基线——`scripts/check-stc.ts`（逐文件 stc --json errors 对照 `scripts/stc-baseline.json` per-file 上限，只许下调；缺失键 0 容错）+ 写入当前普查基线（27 文件 216 错，含 PoC 后 stage-guard/ethics 0 错）+ 单测 `tests/unit/check-stc.test.ts`（超限红/豁免绿/基线下调生效） `[blocked-by: T2]`
- [x] T4: MUST 边界断言——`template-guidance-parity.test.ts` 增 zh 模板禁裸 `MUST|SHALL`（引用例外白名单正则）与 en 模板禁 `必须|不得`两断言 `[blocked-by: T2]`
- [x] T5: 强度词归一（第一刀）——zh-Hans 全模板 I1：`**不要**→不得`、`禁止→不得`、`**须**→必须`、`建议→宜/必须（逐处）`、`勿→不得/不必`；en 模板同步语义；含 PoC 两 unit 已改部分核对；跑 `init --update` 刷产物与 golden 基线 `[blocked-by: T3,T4]`
- [x] T6: 行话与模糊词（第二刀）——G6 `落地→提交`、`闭环`（首现定义+后文循环）、`链路→调用路径`；G5 `相关→匹配 <paths> 的`、`必要时→具体条件`、`部分→枚举`；G4 名词化动词化 `[blocked-by: T5]`
- [x] T7: 长句与自证（第三刀）——G9/G12 validation-hints 59 字句、review-stamp 52 字句拆分；G20 `（不复读）`类括号排除改正面表述 `[blocked-by: T6]`
- [x] T8: 引号批替（第四刀）——zh-Hans 38 处 `「」`→`“”`；STC 复扫全库记录前后数入本 change 备注 `[blocked-by: T7]`
- [x] T9: 门禁收口验证——`bun run check:stc` 绿、`bun test tests/unit/` 绿、`bun run check:skills-template-render` 绿、`bun tests/bdd/assert/quality-gates.ts` 绿、`just check` 绿；stc 基线若有下调随本任务提交理由 `[blocked-by: T8]`
- [x] T10: eval skill_style 断言——`eval/tasks/playbook/tests/skill_style/check.py`（四级词表外强度词计数+`「」`计数→`/logs/verifier/`，恒真观测）+ `eval/groups.yaml.example` 注释补 A/B 双 group 用法示例（stable/stc worktree） `[blocked-by: T5]`
- [x] T11: 文档同步——README QA 门列表提及 check:stc；`AGENTS.md` 项目速览常用命令不变（qa 已聚合无需改）核对 `[blocked-by: T9]`
