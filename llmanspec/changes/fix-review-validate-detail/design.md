# Design: 修复 review validate 信号的误导性 detail 文案

## 决策 1:detail 分流而非新增信号 kind

critical 的两个来源（spec sweep 失败 / strict 规则下 active change 未勾选 tasks）仍合并计入 `validate` 信号 count 与 criticalCount——r23 合约钉死 criticalCount = sweep FAIL 的 capability 数、kind 集合固定，分流仅发生在 detail 字符串层，不引入新 kind、不改计数与退出码。

## 决策 2:detail 文案形状（英文,CLI 输出约定）

- 仅 sweep 失败：`validate --all failed; run `llman-sdd validate --all` for details`（保留 v1 形状,仅修命令名）
- 仅 strict 失败：`N active change(s) with unchecked tasks: <id> (<m> unchecked), ...`——点名即可操作,不再出现 `validate --all failed`
- 兼有：sweep 指引在前,strict 点名在后,以 `; ` 连接
- 全绿时维持 `'ok'` 不变

不做多行/截断处理:active change 数量级为个位数,平铺点名可 grep。

## 决策 3:locked detail 的命令名残留顺带修

`locked` 信号 detail 的 `llman sdd change diff` 同属 v1 命令形态残留,与本次修复同函数同性质,一并改为 `llman-sdd`;其余文件（changeCheck/show 等）的同类残留不扩scope,留待独立清理。

## 权衡

- 备选「strict 失败独立成新 kind（如 `pending-change`）」被否:改变 kind 集合与 criticalCount 口径,触 r23 合约与 HTML 导出,收益不成比例。
- detail 非合约面（r23 只约束字段存在）,无迁移/兼容负担;下游对 detail 的 grep 依赖属人读文案口径（2026-09 定案豁免逐字节对齐）。
