---
depends_on: []
title: 迁移手册按版本组织并以版本范围查询
---

# 迁移手册 per-version 化与范围查询

## Why

1. **用户给出的范围找不到手册（本次直接踩坑）**：注册表以「版本对」为键、精确匹配——用户从
   0.8.2 升级，自然传 `--version-expr '0.8.2->0.9.0'`，报错 `unknown migration`（已知仅
   `0.8.1->0.9.0`、`0.7.5->0.8.0`）。版本对编码的是"升级路径"，用户心智是"我的版本 →
   目标版本"，二者天然错位；每个中间版本发版都要预登记 N 个版本对也不可持续。
2. **playbook 覆盖不完整**：0.9.0 窗口实际含三项迁移（r101 头剥离、check_transitions
   移除、init locale/update 语义），注册表只登记了 r101 一项，迁移 2/3 仅存在于
   README——prompt 命令拿到的手册不完整，与其"agent 可执行迁移手册"的定位不符。
3. **`--version-expr` 表达力弱**：单旗标 `'<from>-><to>'` 需要用户拼对分隔符与格式，
   错误信息（`expected '<from>-><to>'`）把格式负担转嫁给用户。

## What Changes

- **注册表 per-version 重组**（`project/migrations.ts` 重写）：条目键从版本对改为单版本
  `version -> items[]`（每项含 title/steps/checks）；`0.8.0` 承接原 `0.7.5->0.8.0` 的
  治理元数据退役条目，`0.9.0` 聚合本窗口三项迁移（r101 头与 id 分配、
  `specs.check_transitions` 移除、init locale 优先级与 per-workspace update）。
- **范围查询**（`peripheral-commands` 更新 `@req:r100`）：`project migrate prompt` 改用
  `--from-version <v>` / `--to-version <v>`（均 `x.y.z`），按 `(from, to]` 左开右闭
  数值比较聚合范围内全部有登记版本的条目；输出为英文 agent 手册，逐版本 `## <version>`
  头 + 逐条目 `### <title>` + Steps + 自检清单，版本间以水平分割线隔开。
- **空范围友好化**：范围合法但无登记条目时输出"无登记迁移"提示且退出码 0（不再误报
  unknown migration）；仅非法版本格式与 `from >= to` 报错。
- **废弃 `--version-expr`**：继续解析并映射到新旗标语义，但 stderr 输出弃用 WARNING
  指引新写法；与新旗标同给 MUST 报冲突错；`strip-legacy-headers` 拒绝三类选择旗标的
  组合沿用。
- **总览与指导同步**：裸 `project migrate` 总览改为列已知迁移版本与获取提示（新旗标
  写法）；`migrations/v0.8-v0.9/README.md` 升级步骤示例改用新旗标；历史 release-notes
  不回改。

## Capabilities

- `specs/peripheral-commands`（重写 `@req:r100` 的 prompt 部分与场景；strip-legacy-headers
  条款不动）

## Impact

- **行为变更（非硬破坏）**：prompt 子命令旗标面更换（旧旗标软废弃可用）、注册表输出结构
  从单版本对手册变为按版本聚合手册、空范围从报错变为退出码 0 提示。
- **代码**：`packages/core/src/project/migrations.ts`（注册表 + 范围解析 + 渲染器重写）、
  `apps/cli/src/commands/project.ts`（旗标解析与废弃 WARNING）、`packages/core/src/index.ts`
  （导出面调整）。
- **测试 seam（复用既有）**：`tests/unit/migrate-prompt.test.ts`（注册表/范围解析/渲染
  单测）+ `tests/bdd/steps/migrate-scope.ts`（CLI 子进程边界，r100 场景重写）。
- **文档**：`migrations/v0.8-v0.9/README.md` 旗标用法；CHANGELOG 0.9.0 条目随发版收口
  补充（不进本 change）。

## Open Questions

（无——范围语义、废弃策略、输出格式已在 design.md 定案，均为可逆实现层决策。）
