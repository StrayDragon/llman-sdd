# tasks

测试边界（seam）：复用既有 BDD runner（CLI 子进程）+ 模板指引 parity 门，不发明新边界。

## t1 validate 旗标移除（CLI + specs + 测试面）

- [x] T1: validate.ts 删除 `--no-check` option，更新 makeHarnessGate 三态注释
- [x] T2: validation.feature r13 条款删除 `--no-check` 分句、场景删除 `--no-check` 步骤对
- [x] T3: steps/validation.ts 删除 `运行 validate --specs --no-check` 绑定并将其余 `validate ... --no-check` 调用点剥除旗标；steps/config.ts 同步
- [x] T4: config/schema.ts、validation/harness.ts、review/review.ts 注释同步（缺省跳过/--check 显式）

## t2 spec/模板一致性（init-generators r70 + 四技能模板）

- [x] T5: init-generators.feature r70 必含声明句删除 `--no-check` 提及（保留 `不是通过` 标记语义改为「缺省结构门不是通过」）
- [x] T6: apply/verify/propose/explore 模板（zh/en）移除 `--no-check` 并补修 propose/explore 的 opt-in 残留；`init --update` + 重生 golden 基线
- [x] T7: 全量门禁：bun run check + bun test tests/ + check:skills-template-render + validate --all --strict 全绿（分支上相对 merge-base）
