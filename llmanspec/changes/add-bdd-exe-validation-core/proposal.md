---
depends_on: []
needs_specs_change: true
---

# BDD executable 化·HIGH 批:validation + change-lifecycle 核心合约配对验收

## Why

阶段性 QA 调研(2026-09-23)计量:全仓 67 规则 / 48 enforced / **19 pending**。pending = 无配对 @executable 验收的 MUST 规则,零行为守护、校验全绿无信号——r13(no-op 旗标)即活证:合约钉了 `--check` 执行 bdd.run_command、模板 8 处描述它、实现零调用,三方冲突潜伏至今。本批清 HIGH 层 6 条(parity 关键的对外可观测合约),并把 pending 总量 19→13。

## What Changes(工作说明,含场景形态与 seam)

Specs landing 两个文件:`llmanspec/specs/validation.feature`、`llmanspec/specs/change-lifecycle.feature`。**不得触碰其他 spec 文件**(与 add-bdd-exe-authoring-surface / add-bdd-exe-meta-foundation 并行,文件不相交约束)。

1. **r13 重定合约(委托语义)**:`--check` 条款由「MUST 执行 bdd.run_command」改写为「validate 不执行 harness;BDD 执行责任在项目测试套件(qa 内 `bun test tests/bdd`);`--check/--no-check` 旗标保持 v1 表面接受,help 与模板文案指向委托现实」。随之:
   - 8 处模板文案修正(zh/en × explore/verify/propose 的 `--no-check` 句)——注意模板对账门禁(r67)与 golden 需随动
   - 删除仅测试存活的 `expandRunCommand`/`hasPlaceholders`/`PlaceholderTarget`(changeCheck.ts:324-341)与其唯一测试引用(validation.test.ts:148-158)
2. **r11 @executable**:种子缺陷 fixture → `FAIL spec/<cap>` / `OK` 行 + `Totals: N passed, M failed (K items)` + 退出码非零。seam:CLI 子进程(stdout 正则 + 退出码步骤既有)。
3. **r64 @executable**:proposal 写入合法集外字段(如 status)→ ERROR 且消息含字段名与合法集;六合法字段逐一放行。seam:fixture 仓库。
4. **r65 @executable**:无 @req 链接的 @executable 场景 → WARNING,path `<capability>/acceptance/<场景名>`。
5. **r63 @executable**:stage=full 已绑定未 landed → WARNING 带 llman-sdd-propose 引导、不建议重跑 change start;默认分支脏 specs → 工作区级 WARNING。
6. **r13 配套 @executable(重定后)**:`--check/--no-check` 接受且不改变校验结果(no-op 契约化),文案不再宣称执行 harness。
7. **r16 @executable**(change-lifecycle):git fixture 依次造 main/master/origin/HEAD 缺失组合,断言解析顺序与四者皆缺报错。

## Capabilities

- validation(r11/r13/r63/r64/r65)
- change-lifecycle(r16)

## Impact

- pending 19→13(`just pending-gate` 基线随 finalize 下调至 13)
- r13 为行为合约重定:validate 对外承诺变化(不再虚指 harness 执行),无输出字节变化;golden 不涉(模板文案改则随动)
- 并行约束:仅动上述两 spec + 模板 8 处 + validation 相关代码/测试;不得并行触碰 peripheral/spec-parsing/config-schema/init-generators/monorepo-structure/review-freeze 的 specs
