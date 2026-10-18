---
depends_on:
  - unify-numeric-id-allocation
title: 多根实例下的命名空间作用域界定与全命令实例根解析补齐
needs_specs_change: true
branch: sdd/subproject-namespace-scope
base_branch: main
base_sha: a208183e941ed815f8ee10f9563c951d1b89eecc
---

# 多根实例下的命名空间作用域与实例根解析收口

## Why

多根实例的底座已经落地（validation r91 的根发现与双粒度校验、cli r109 的实例根解析、
peripheral-commands r94 的按根 req 注册表），但收口还留着两条缝。

**缝一：唯一性域只写了四分之一。** 四类命名空间里只有 req id 有明文作用域（r94：各根
注册表独立、跨根不保证唯一）。change id 的唯一性门（validation r87）只对一棵 `changes/`
树判重；capability id 的重复门只在单个 `specs/` 目录内触发，跨根同名 capability 是**静默
重复**（无报错，`show <cap>` 只找当前根）；非数字 id（change slug、场景名、归档 dated id）
干脆没有任何查重门。多根并存时「同名算不算冲突」只能靠读者从实现反推。

**缝二：r109 的「`--directory` MUST 对全部命令可用」账实不符。** `context` 与
`index rebuild` 读取了 `options.directory` 却没有声明该选项；`change` / `archive` 完全没有
根发现，且以 cwd 字面量为根——在 `packages/foo/` 下跑 `change new` 会就地铺出
`packages/foo/llmanspec/changes/`；`project` 虽有向上发现却同样缺选项声明。

两条缝都不改单根行为（r91 铁律），但都会在子项目根全面消费时变成静默歧义。早先的子项目
提案（前代 issue #6）选择推迟，本 change 是那次推迟的收口。

## What Changes

新增 capability `scope-boundaries` 承载「唯一性域」这一横切面（req id 域仍以
peripheral-commands r94 为 SSOT，只引用不复读）：

- **四类命名空间的唯一性域逐类明文**：每类的域 = 单一实例根；跨根同名/同号合法，
  MUST NOT 阻断、MUST NOT 视作冲突。
- **跨根同号 MUST 可观测**：在聚合校验面（`validate --all-roots`）产出
  `{类别, 共享值, 涉及根}` 明细 + 计数汇总；human 形态附处置指引（指向 `--directory`），
  machine 形态不带该行；MUST NOT 影响退出码。形状细节归 validation r91。
- **根限定一律经 `--directory`**：MUST NOT 引入 id 内嵌根限定语法（`path#id` / `root:id`）。
- **写入默认限根**：写入/改写命令的默认目标 MUST 限于当前解析实例根；两处明文豁免——
  `init --update` 的扫块刷新、用户显式传入的路径参数。
- **单一归属门不回归**：MUST NOT 重新引入跨根 scope 重叠校验（0.8.0 已移除，理由存 design）。

把 r109 从「声称」补成「账实相符」：写入命令覆盖清单 + 两处显式豁免（`init` 以位置参数
`[path]` 定根、`self *` 无实例语义）；`change` / `archive` / `project` 接入同一根发现算子；
`context` / `index rebuild` 补选项声明。

validation r91 的聚合报告扩展：覆盖 change id 粒度（今天只跑 specs 粒度）并新增
`crossRootCollisions` 段；仅发现单根时该字段 MUST NOT 出现（守住逐字节一致铁律）。

change / archive 命令的实例根解析另在 change-lifecycle 立条款钉住：子目录 cwd 自动归位
最近实例根；向上无有效实例时报域错误（exit 1）而非就地新建。

附带两笔收敛：`nextReqId` 改调 `nextNumber` 原语（零语义变化，关掉一处「声称单一原语、
实为调用点重写」的落差）；`tests/bdd/steps/roots.ts` 中三个断言「报 single-ownership
错误」的孤儿步骤反写为「不回归」场景。

## Capabilities

- 新增 `scope-boundaries`：四类域声明 + 跨根同号可观测 + 根限定一律 `--directory` +
  写入限根 + 单一归属不回归。
- `cli`（r109）：命令覆盖清单与两处豁免；写入命令接入实例根解析。
- `validation`（r91）：聚合增 `crossRootCollisions` 段与 change 粒度；单根不产出。
- `change-lifecycle`：change / archive 的实例根解析与无实例域错误。
- 引用不改：`peripheral-commands` r94（req id 域 SSOT）、`validation` r87（change id 门）、
  `spec-parsing` r10（注册表语义澄清为「实例内全局」）。

## Impact

- **单根零漂移**：新增域声明与观测段在单根下不产生任何输出差异（r91 / r109 铁律）。
- **唯一可观测行为变更**：子目录 cwd 下 `change` / `archive` 的解析与落盘目标归位到最近
  实例根；无有效实例报域错误。属修正，但用户可感知 → 追加到
  `migrations/v0.9-v0.10/README.md` 破坏面清单（与「只读命令接入根发现」并列）。
- **无 schema 破坏面**：不移除 / 重命名任何字段、命令、tag 或 stage 值域。
- **代码面**：`change` / `archive` / `project` 接入 `resolveInstanceRoot`；`validate
  --all-roots` 扩 change 粒度并产 `crossRootCollisions`；`context` / `index rebuild`
  补选项声明；`specHelpers.nextReqId` 改调 `nextNumber`。

## 非目标

- 不扩大唯一性域（不做全仓唯一）：跨根同名是**合法状态**，不是待消除的冲突。
- 不搬运 r91 / r109 / r94 既有条款（域收敛重排另立 change，本 change 只新增新面）。
- 不重新引入单一归属门（历史决定见 design）。
- 不引入 id 内嵌根限定语法。
