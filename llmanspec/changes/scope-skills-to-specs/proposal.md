---
depends_on: []
title: skill 指引收敛至 specs 关联面并清除仓库特定命令残留
needs_specs_change: false
---

# skill 指引收敛至 specs 关联面并清除仓库特定命令残留

## Why

templates 渲染的 skills 同时交付用户项目与本仓自举,但三处指引把本仓(或前代 Rust 仓)的工程约定写成了普遍约定,用户项目照做会错,本仓 agent 照做也会撞墙:

1. apply skill 验证块写死“测试集:`just test` 或 `cargo test --all`;格式/lint:`just check` 或 `just lint` + `just fmt`”。问题双层:对 pytest/bun 等无 just/cargo 的项目无从对应;对本仓自身,“just lint”“just fmt”两个 recipe 并不存在(实有 `check`/`test`/`lint-fix`/`format`),agent 照 skill 执行得 unknown recipe。
2. 同块验证阶梯 L1/L2 写 `bun test tests/unit/...`——Bun 仓专属路径,非 Bun 项目被误导;产品 skill 应表述“项目等价入口”,不应预设技术栈。
3. 全部 skill 无一处陈述 SDD 管辖范围:agent 可能把仓库自身工程文件(构建脚本、CI、一般文档)也纳入 change 分支/proposal 流程。SDD 流程只应约束行为合约面,其余按工程常规直改。
4. propose skill 步骤 0 仍要求“核对 spec valid_scope 完整性”——v0.8.0 已移除 scope 概念,实测 `list --specs --json` 输出无 `valid_scope` 键,该句已不可执行。

## What Changes

- `packages/core/templates/zh-Hans/skills/llman-sdd-apply.md` 与 `en` 同位:
  - 验证块首行改为项目无关表述:门禁入口以项目自身配置为准(package.json scripts、justfile、Makefile、config.yaml `specs.check_command` 等),不拼写具体工具名。
  - 验证阶梯保留 L1→L4 成本递增语义,命令侧改为能力描述(L1 项目单测的直接导入层;L2 定向执行 BDD/等价手段;L3/L4 本就是产品命令 `validate --check`/finalize,不动)。
  - 实施循环前新增“SDD 管辖范围”条款:SDD 流程(change 分支、proposal、specs 编辑门)只约束 `llmanspec/**` 行为合约面及其产物对齐;仓库其余文件按项目常规工程流程直改直提交,不要求 change 包装;仅当改动触碰行为合约语义时才入 SDD 流程。
- `packages/core/templates/{zh-Hans,en}/skills/llman-sdd-propose.md` 步骤 0:删除 valid_scope 核对句,替换为“`llman-sdd list --specs` 确认 specs 清单可读”。
- 重生成 `tests/golden/baseline`(skills 与 skills-en 双 locale),并在绑定分支运行 `init --update` 刷新本仓 `.agents/skills`(自举纪律)。
- zh/en 成对修改守 parity 门(r70);文案过 STC 门(r97,基线只许下调);模板命令字面过命令对账门(r67)。

## Capabilities

- `init-generators`(skills 模板文案面;无 CLI 行为变更,无 schema 变更,无合约句子增删——渲染产物由既有 r67/r70/r80/r97 四门守护,故 `needs_specs_change: false`)。

## Impact

- 渲染产物 `.agents/skills/**` 与 `tests/golden/baseline/**` 随动(同 commit 刷新,render 门守新鲜度)。
- 用户项目升级后重跑 init 方得新文案(常规分发节奏,非破坏)。
- 本仓 agent 后续读 apply/propose skill 即获得正确管辖范围与可执行命令面。

## 测试边界(seam)

无新 seam。复用既有门禁:golden 渲染基线(r80)、STC 文风(r97)、zh/en parity(r70)、模板命令对账(r67)及 `just qa` 全集;前后对比类判据(STC errors 计数)在 change 分支相对 merge-base 测量。
