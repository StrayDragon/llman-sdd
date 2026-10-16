---
depends_on: []
title: 统一 init 渲染 locale 优先级链并将托管块刷新收敛为 per-workspace 语义
branch: sdd/unify-init-locale-precedence
base_branch: main
base_sha: 3cd80d34a3fa8514de980b4c53597b4dafab8abd
---

## Why

用户实测 `llman-sdd init --update` 后认为托管块未被刷新且语言与配置不符。调研证实三个合约空白叠加造成该观感：

1. `--locale`/`--lang` 在 `llmanspec/config.yaml` 已存在时被静默忽略——`runInit` 中该选项唯一消费点 `writeDefaultConfig` 被 config 存在性守卫（`packages/core/src/init/init.ts:123`），r50 只定义了 fresh init 的别名语义，update 时的 locale 来源在合约中空白。
2. 既有 config 缺 `locale:` 键时，schema 默认 `'en'`（`packages/core/src/config/schema.ts:77`）静默生效：中文项目的托管块与 skills 每次 update 都渲染为英文，无任何提示。
3. init 不做实例向上解析（其他命令经 r94 `resolveInstanceRoot` 走 walk-up，init 直用 cwd）：在项目子目录跑 `init --update` 会在子目录新建英文默认实例，根实例的 AGENTS.md 纹丝不动——同一动作同时产生"块没更新"与"语言不对"两个观感。

另有两处规范与代码的偏差需要一并收敛：r93 原文"init --update MUST 复用根发现算子刷新全部发现根的托管块"没有仓库根限定词，而 CLI 以 `repoRootInstance` 门控了扫描（子根上跑 `--update` 只刷自身、不刷后代根）；托管块 marker 的更新契约（双齐替换 / 逆序报错 / 缺失前置插入）从未写入规范，格式偏差时静默前置插入新块的行为对用户不可见。

## What Changes

- **locale 优先级链统一**（改 r50）：渲染生效 locale 一律按 `config.locale（键显式存在时）> CLI 选项 > 内置默认 'en'` 解析；config 缺失时生成 config 并取 `CLI 选项 > 内置默认`；多 workspace 实例各自独立解析，互不继承。
- **缺键告警**（新条款）：既有 config 无显式 `locale` 键时，init/update 必须输出 WARNING 指明回退值与修复路径（补键或显式传选项）。
- **托管块刷新 per-workspace**（改 r93 落地语义）：`init --update` 在任意实例根上均复用根发现算子刷新全部发现根的托管块（skills 渲染与 `llman-sdd-*` 命名空间清理仍仅仓库根实例）；移除 CLI 侧 `repoRootInstance` 对块扫描的门控。
- **新建实例告警**（新条款）：目标 cwd 不是实例根但祖先存在有效实例时，init 必须输出 WARNING 指明将新建独立实例与既有实例位置。
- **marker 契约显式化**（改 r93）：双标记齐且有序 → 原位替换块体；END 先于 START → 报错；标记缺失 → 整块前置插入。行为与现行实现一致，补成规范条文。

## Capabilities

- `specs/init-generators`（r50 重写、r19 不动、r93 语义修正、新增两条告警条款）

## Impact

- 代码：`packages/core/src/init/init.ts`（locale 解析函数 + 告警输出通道）、`packages/core/src/config/load.ts`（暴露 locale 键显式存在性）、`apps/cli/src/commands/init.ts`（移除扫描门控 + 透出告警）。
- 告警走 stderr 还是 stdout、WARNING 文案——随实现定，CLI 错误出口契约（`specs/cli`）不受影响（告警非错误，退出码 0）。
- 无破坏性合约变更：`--locale` 语义是"从静默忽略变为生效"，fresh init 行为不变；config schema 不改（`.default('en')` 保留，显式存在性经 load 细节旁路暴露）。

## Open Questions

（探索期已决策，2026-10-16 用户确认）

- ~~update 时 `--locale` 是否生效~~ → 决策：不忽略；优先级链 `config.locale > CLI 选项 > 内置`，无 config 时生成并取 `CLI 选项 > 内置`，多 workspace 分别处理。
- ~~缺 `locale` 键是否告警~~ → 决策：需要。
- ~~AGENTS.md 注入范围~~ → 决策：per-workspace（任意实例根的 update 都刷新全部发现根），新建实例场景加 warning。
- ~~r93 扫描门控措辞与 marker 行为~~ → 决策：澄清并显式成文。
