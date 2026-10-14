---
depends_on: []
title: skill 指引收敛至 specs 关联面并清除仓库特定命令残留
branch: sdd/scope-skills-to-specs
base_branch: main
base_sha: 5aaa8997c1cd8ea1cd4d319f8b01e7848489cbc5
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
  - 验证块改为动态发现表述(用户定案:不假定任何任务工具,含 just 本身):执行本仓已声明的验证手段,以仓库文档与配置记载为准;已配置 `specs.check_command` 时以 `llman-sdd config` 读得为准;未声明则询问用户。唯一允许的工具锚点是产品自有约定 `specs.check_command`。
  - 验证阶梯保留 L1→L4 成本递增语义,命令侧改为能力描述(L1 项目单测的直接导入层;L2 定向执行 BDD/等价手段;L3/L4 本就是产品命令 `validate --check`/finalize,不动)。
  - 硬约束列表新增“管辖范围”条款:SDD 流程(change 分支、proposal、specs 编辑门)只约束 `llmanspec/**` 行为合约面及其产物对齐;仓库其余文件按项目常规工程流程直改直提交,不要求 change 包装;仅当改动触碰行为合约语义时才入 SDD 流程。
- valid_scope 残留清理共 4 文件:apply zh/en 的 Preflight 与 propose zh/en 的步骤 0 各有一句“核对 valid_scope 路径”——v0.8.0 已废该概念(实测 `list --specs --json` 无此键,源码仅存注释性示例),统一替换为“`llman-sdd list --specs` 清单可读”检查;propose 另改步骤 4 校验口径:步骤 4 校验口径改为普通 `validate <change-id>`(结构门)——`--strict` 把警告升级为失败,propose 阶段未勾 task 恒为警告,strict 留给实施收口后的完成判定。
- 重生成 `tests/golden/baseline`(skills 与 skills-en 双 locale),并在绑定分支运行 `init --update` 刷新本仓 `.agents/skills`(自举纪律)。
- zh/en 成对修改守 parity 门(r70);文案过 STC 门(r97,基线只许下调);模板命令字面过命令对账门(r67)。
- verify 后用户裁定本分支清零两 finding,扩围两项:①WARNING——peripheral-commands r90 场景化绑定(新增 tests/bdd/assert/morphology-names.ts 对账脚本),unbound 1→0;②SUGGESTION——r97 强度词表外检测整词优先(不要求先于不要),消除“不要求”被子串误读为「不要」的歧义。live 合约编辑已发生,frontmatter needs_specs_change 撤 false回归缺省。

## Capabilities

- `init-generators`(skills 模板文案面;无 CLI 行为变更,无 schema 变更)与 `peripheral-commands`(仅 r90 增配可运行场景,规则文本零改)——specs 落地随本 change 分支提交。

## Impact

- 渲染产物 `.agents/skills/**` 与 `tests/golden/baseline/**` 随动(同 commit 刷新,render 门守新鲜度)。
- 用户项目升级后重跑 init 方得新文案(常规分发节奏,非破坏)。
- 本仓 agent 后续读 apply/propose skill 即获得正确管辖范围与可执行命令面。

## 测试边界(seam)

无新 seam。复用既有门禁:golden 渲染基线(r80)、STC 文风(r97)、zh/en parity(r70)、模板命令对账(r67)及 `just qa` 全集;前后对比类判据(STC errors 计数)在 change 分支相对 merge-base 测量。
