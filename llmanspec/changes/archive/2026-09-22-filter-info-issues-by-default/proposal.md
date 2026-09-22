---
depends_on:
  - add-render-layer
branch: sdd/filter-info-issues-by-default
base_branch: main
base_sha: d2b613dd178cab670740c38dd53ddd9081a44883
---

# INFO 级 issue 缺省过滤(--include-info 恢复)

## Why

`validate --all --json` 在真实仓库(xylitol:68 个全 valid 的 spec)输出 4459 行,其中 INFO 级 issue(pending 规则提示等)占绝对多数——这些是健康状态的提示性噪音,人读文本路径本就不展示(仅 FAIL 项打印),唯独 JSON 面全量倾泻,是 agent 消费 token 的最大单项浪费(三仓库调研 P3)。缺省只报 WARNING+ 可砍约 60-80% 输出,是 TOON 缺省化(C3)之前先行落袋的收益。

## What Changes

- `validate` 新增 `--include-info` flag;缺省(不传)时 items 的 issues(文本与 JSON 同口径)仅含 WARNING 及以上级别,传旗恢复全量
- 级别过滤不影响 valid 判定、summary 计数口径与退出码(INFO 从不参与判定——v1 语义)
- 合约增条款:`validation.feature` 新增 r32(@human 规则 + @executable 验收场景),级别过滤的 MUST 与恢复语义入约
- 范围修正:原计划含 review,核实后 review 的信号面是聚合计数(pending/unbound/stale),无 INFO 级 issue 通道,本变更仅涉 validate

## Capabilities

- validation(新增 r32 条款,Specs landing 于绑定分支)

## Impact

- 代码:`apps/cli/src/main.ts`(validate action 过滤 + flag);`tests/bdd/steps/domain.ts`(r32 场景 steps)
- 合约:validation.feature 增 r32;`--json` 结构不变(issues[] 元素集缩小属语义新增,由 r32 描述)
- 兼容性:依赖 INFO 缺省全量的下游需显式加 `--include-info`;文本缺省行为不变
