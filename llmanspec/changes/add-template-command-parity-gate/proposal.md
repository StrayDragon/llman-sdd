---
depends_on: []
needs_specs_change: true
---

# 模板命令对账门禁:模板引用的 CLI 命令/旗标与实际命令面自动对账

## Why

2026-09-23 模板↔CLI 一致性审计连发三类真实漂移(toon2features 失效指引、validate FAIL 行旧形态、`show --json` 从未不存在却 19 处被引用),全部靠人肉逐条对账发现——纯人工守不住:模板文本不受任何合约钉死(仅 golden 钉渲染字节,模板改了重生成基线即过),漂移可无门禁地合入。把该次手工审计固化为自动门禁,纳入既有 `bun test` 套件(monorepo-structure r13 的 qa 组成不变),防同类漂移再次合入。

## What Changes

- 新增 `tests/unit/template-command-parity.test.ts`:扫描 `packages/core/templates/**`(双 locale 的 skills+units)中全部 `llman-sdd <path> ... --<flag>` 引用,对每条引用:
  - 命令路径经 `bun apps/cli/src/main.ts <path> --help` 探测存在性(路径不存在 → 违例);
  - 每个 `--flag` MUST 出现在该命令 `--help` 输出中(旗标不存在 → 违例,`show --json` 类缺陷即被此拦下);
  - 零违例通过,违例输出逐条 `[template] 引用 → 违例原因`。
- Specs landing:`monorepo-structure.feature` 新增 r67(@human 规则 + @executable 验收),把对账门禁的存在性与通过性钉进合约,r13 的 qa 组成(check + bun test)不随之改动。
- @executable 场景复用既有 smoke steps(执行命令/退出码),场景命令跑 `bun test tests/unit/template-command-parity.test.ts`,零新增 step。

## Capabilities

- monorepo-structure(r67 条款,Specs landing)

## Impact

- 代码:仅新增一个测试文件 + spec 一个 rule 对;无运行时逻辑改动,无 CLI 面变更
- 兼容性:无破坏;qa 时长增加一次嵌套 `bun test` 子进程(~1-2s,与 smoke 既有子进程模式同量级)
- 已知边界:对账只保证「引用的旗标存在」,不校验旗标值域/语义;散文形如 `--json` 无命令前缀的引用不在扫描面(本次审计显示漂移均带命令前缀)
