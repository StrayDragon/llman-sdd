# tasks

测试边界（seam）：全部复用既有 harness seam，不发明新边界——

1. CLI 子进程（`tests/helpers/spawn.ts` 的 `runCli`；既有 BDD 场景 seam，绑定在 `tests/bdd/steps/validation.ts`）。
2. 纯逻辑 `runHarnessForSpecs` / `makeHarnessGate`（core 导出 + CLI 边界；既有 `tests/unit/validation.test.ts` T5 seam）。
3. skills 模板渲染门（`tests/golden/`，init 产物 vs 基线；改造模板后必重生基线与 `.agents/skills`）。

## t1 specs 条款翻转（validation.feature r13/r48）

- [x] T1: 改写 r13 条款与「配置 check_command」场景——缺省 MUST NOT 执行 harness；`--check` MUST 显式执行；`--no-check` MUST 跳过（与缺省同效、显式声明放弃证据）；help 文案断言同步
- [x] T2: r48 三处观察 harness 执行的场景（占位符逐项/无占位符 batch-once/harness 失败映射）补 `--check`
- [x] T3: `tests/bdd/steps/validation.ts` 步骤绑定同步——新增 `运行 validate --specs --check` 与 `--specs --check --json` 形态，适配改写后场景文案

## t2 CLI 缺省翻转（validate.ts + unit）

- [x] T4: `makeHarnessGate` 缺省（无旗标）映射 `off`（不执行）；`--check` → `on`；`--no-check` → `off`（显式制）；`--check`/`--no-check` help 文案与 harness banner 更新
- [x] T5: `tests/unit/validation.test.ts` T5 对齐——core `default` 分支语义注明不再由 CLI 下发；其余核心语义不回归

## t3 纪律与引导（AGENTS + skills 模板 + golden）

- [x] T6: AGENTS.md「门禁证据必须来自真实 harness」改写为 opt-in 一致（validate 结构门不声明 harness 证据；`--check` 与 finalize/archive 承载全量证据），并新增「验证阶梯」纪律（unit → 定向 BDD → `validate --check` → finalize 逐级扩大）
- [x] T7: apply/verify skill 模板（zh-Hans+en）写入阶梯与 opt-in 语义；`init --update` 刷新 `.agents/skills` 并重生 golden 基线（`generate:skills-template-baseline`）

## t4 分支内验证（相对 merge-base 现算）

- [x] T8: `bun run check` + `bun test tests/`（含改写 BDD）+ `check:skills-template-render` + `validate --all --strict` 全绿
