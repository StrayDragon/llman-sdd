# 工作清单

- [ ] T1: 改写 validation r13 的禁止句，并在 change-lifecycle 增加收口验收的规则与可执行场景
  - 完成判据: `llman-sdd validate fix-finalize-runs-harness --strict --no-check` 结构通过；新场景已挂上 `@req`
- [ ] T2: [blocked-by: T1] finalize 与 archive 在合并前按 design 的三步判定执行或拒绝
  - 完成判据: 本分支上，对应 BDD 场景由临时仓库 CLI 跑通（标记文件被写、失败零写入、跳过文案出现、嵌套与缺命令均中止）
- [ ] T3: [blocked-by: T2] apply / verify 模板补上「收口会跑、跳过说明不是通过」，刷新技能产物与 golden
  - 完成判据: 本分支上 `bun test tests/unit/template-guidance-parity.test.ts` 退出 0，且 `just golden` 无差异
