---
depends_on: []
title: 状态流转校验以 @transitions/@no-transitions 显式标记定界并移除配置开关
branch: sdd/tag-scope-transitions-check
base_branch: main
base_sha: 852a8c7d4ae1b48a918353bf095966bb435bb30c
---

# 状态流转校验 tag 定界化

## Why

1. **隐式规则不可发现**：shape 嗅探契约（特征词表 `from`/`event`/`to` 及中文别名、三族列"至少两族"判据）只存在于实现源码中——用户与外部 Agent 无从得知某张 `例子:` 表为何被（或不被）纳管，误判时（如数据映射表恰好含 `from`/`to` 列）只能读源码排查。
2. **全局开关粒度过粗**：`specs.check_transitions` 是整仓布尔；单个误伤场景迫使整仓退出守卫，反向也无法对单一场景强制纳管。
3. **E4 死锁门禁名不副实**：无终态分支存在恒真死代码（`transitions.ts:247-257` 内层重复 `hasPath` 调用），且实际检查"无法回到初始状态"却报"无法到达任何终态"——语义需澄清后固化进合约。
4. **skill 模板要求稳定**：判定细节不应烘焙进模板文案（会漂移）；应由 CLI 只读内省命令承载单一事实源，模板与 skill 零改动。

## What Changes

- **发现机制三级化**（`validation` 重写 `@req:r104`）：
  - `@transitions`：强制纳管——即使特征列不全也进入校验（残缺表由 E1 拦截，作者意图得到响亮反馈）；
  - `@no-transitions`：显式豁免——即使命中特征词也完全跳过（误伤逃生门）；
  - 无 tag：保留特征词嗅探自动纳管（判据不变：三族列至少两族）——**始终启用**，不再依赖配置；
  - 同一场景同时挂双 tag → 判 ERROR。
- **配置契约收缩**（`config-schema` 更新 `@req:r5`、重写 `@req:r102`）：移除 `specs.check_transitions` zod 字段与 JSON Schema artifact 定义；遗留键宽松剥离并向 stderr 输出 WARNING 提示改用 tag（沿旧 `bdd` 段先例，零硬破坏）。
- **新增 CLI 只读内省**（`peripheral-commands` 新增 `@req:r105`）：`llman-sdd spec transitions` 输出特征词别名集、发现判据、tag 语义与 E1–E4 门禁清单；内容常量由 core 单一事实源导出。
- **E4 语义澄清与修复**（`validation` `@req:r104`）：无终态时"死锁/陷阱"统一定义为"无法回到初始状态"；清理恒真分支，错误消息如实描述被违反的不变式。
- **迁移文档**：追加 `migrations/v0.8-v0.9/README.md` 一节（行为变化：嗅探缺省启用、开关移除的升级路径）。

## Capabilities

- `validation`（重写 `@req:r104`：tag 定界发现 + E4 语义澄清）
- `config-schema`（更新 `@req:r5` 字段枚举；重写 `@req:r102` 为遗留键剥离契约）
- `peripheral-commands`（新增 `@req:r105`：`spec transitions` 内省子命令输出契约）

## Impact

- **行为变更（非硬破坏）**：未设置 `check_transitions` 的存量仓库从"缺省关闭"变为"嗅探始终启用"——命中特征词的例子表将开始被校验；误伤场景以 `@no-transitions` 豁免；遗留配置键剥离并 WARNING。升级路径见 `migrations/v0.8-v0.9/README.md`。
- **CLI 表面**：+1 只读子命令 `spec transitions`，无新旗标。
- **依赖**：无新增、无移除（`xstate`/`@statelyai/graph` 保留）。
- **skills 模板**：零改动——规则细节由 CLI 内省承载（模板稳定性目标）。
- **测试面**：`tests/bdd/steps/validation.ts`、`tests/bdd/steps/config.ts`、`tests/unit/transitions.test.ts`、`tests/unit/config.test.ts` 随合约同步改写。

## Open Questions

（无——tag 命名、判定次序、E4 统一不变式已在 design.md 定案为 ADR，均为可逆实现层决策。）
