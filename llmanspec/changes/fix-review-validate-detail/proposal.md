---
depends_on: []
needs_specs_change: false
---

# 修复 review validate 信号的误导性 detail 文案

## Why

`review` 的 critical 计数由两个来源汇成：validate sweep 的 spec 失败，以及 strict 规则下 active change 的未勾选 tasks（v1 `--strict --no-check` parity）。但 `validate` 信号的 detail 恒定输出 `validate --all failed; run llman sdd validate --all for details`——当 critical 实际来自未勾选 tasks 时，按提示去跑 `validate --all` 会显示全绿，把用户引进死胡同（真实案例：下游仓库 critical=1 而 `validate --all` 全绿，排查无门）。detail 也不点名是哪个 change、多少未勾选，不可操作。另外两处 detail 里的命令写作 `llman sdd`（v1 父命令形态），v2 二进制实为 `llman-sdd`。

文案内容不受 `review-freeze.feature` r23 合约钉死（合约只约束字段存在、kind 覆盖、criticalCount 语义与退出码），本变更不改任何 MUST/SHALL 行为。

## What Changes

- `review` 的 `validate` 信号 detail 按失败来源分流：
  - 仅 sweep 失败：保留原指引，命令名改为 `llman-sdd validate --all`
  - 仅 strict 失败（active change 有未勾选 tasks）：点名各 change id 与未勾选数，不再谎称 validate --all failed
  - 两者皆有：合并报出
- 顺带修正 `locked` 信号 detail 中的同类 v1 命令残留（`llman sdd change diff` → `llman-sdd change diff`）
- 单测覆盖三种 detail 分流；不改变 signals 形状、criticalCount/退出码语义与 HTML 导出

## Capabilities

- review-freeze（实现层文案修复，无合约条目变更）

## Impact

- 代码：`packages/core/src/review/review.ts`（detail 计算）；`tests/unit/review.test.ts`（新增断言）
- 兼容性：无破坏——JSON 字段集、计数与退出码不变，仅 detail 字符串内容更准确；下游若 grep 该文案需同步，属人读文案（对齐口径定案豁免）
- 后续（不在本变更）：其他文件（changeCheck/show 等）同类 `llman sdd` 残留可另行清理
