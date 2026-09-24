---
depends_on:
  [
    fix-lifecycle-validation-defects,
    harden-core-purity-config,
    align-docs-and-gates
  ]
needs_specs_change: true
branch: sdd/align-report-cli-surface
base_branch: main
base_sha: a02eff1a754d974894d8a93480095161f627c2b3
---

# 报告面与 CLI 命令面对齐、残留面彻底清除与 0.4.0 发布

> **状态:规划壳(第二波)**。本分支仅含规划;第一波三个 change 归档后 rebase 到 main,再 `change attach` 并完成 Specs landing(见 tasks T0)。design §3 四项已定案。

## Why

2026-09-24 审计中,除第一波已覆盖的缺陷外,剩余问题集中在「对外表面」——CLI 旗标、输出模式、模板陈述与 schema 字段——且彼此交织、与第一波文件相交,故放在第二波统一处理:

- **假装存在的面**:`archive --skip-specs`(「legacy flag accepted for v1 parity」)、`list --changes`(缺省即是)、全局 `--no-interactive` 与 `config skills --no-interactive`(打印「Run without --no-interactive to edit interactively」,但不存在交互选择器)、`show --output deltas`、show JSON 常量 `deltaCount: 0` / `deltas: []`、`graph --format` 接受任意值(预期仅 mermaid)、全局 `--max-scan-depth` 声称对 review/graph 生效实际被忽略。
- **已移除命令的残留**:`change checkpoint`/`change delta` 已删,但 zh-Hans/en 模板共 20+ 处继续提及它们,且陈述「调用即以非零退出报错,指向 finalize」为假(实际为 commander `unknown command`,无指引);用户定案:**彻底清除,不留 stub,以 rg 零命中验收**。
- **输出模式不一致**:`show --output compact-json` 回落人读文本;`review` 无 `--compact-json` 别名、`index check` 无 `--json` 别名,与其余报告命令不对称;各命令重复注册同一组输出旗标;未知命令报 `Error: error: unknown command ...`(双前缀)。
- **第一波登记的收尾**:删除 `bdd.bindings` 整体(review 已不消费)、`archive.min_completion_ratio` schema 字段(门禁已由第一波删除)、`loadCliConfigUnchecked`;清空纯度门禁过渡白名单(`review/review.ts` 的 `process.env`/`new Date()`);`spec skeleton` 的 `io.mkdirp('src/')` 与 `# scope: src/`(仓库根空 `src/` 的根因);零消费的 `TemplateEngine` port 声明去留。
- **模板体积与失真**:多 skill 重复同一 git-native 段落、migrations 段对脚本的过度 MUST。
- **发布**:版本 0.3.1 → 0.4.0,CHANGELOG 「Unreleased (0.4.0)」转正并登记第一、二波 breaking。

## What Changes

(Specs landing 在 T0 完成;涉及 capability 预估见下,具体 rN 以 r90 起分配。)

1. 删除全部假装存在的旗标/输出 token/JSON 常量字段,命令面与 specs 一一对应。
2. 模板与代码中对 checkpoint/delta/solidify/feature_delta/project import 的全部提及清除;新增对账门禁锁定「已移除面零提及」。
3. 输出模式:统一由共享注册函数挂载 `--output`/`--json`/`--compact-json`;所有报告命令同一值域;`show --output compact-json` 真实输出单行 JSON;错误前缀单一化。
4. `--max-scan-depth` 对 review/graph 真实生效。
5. 第一波收尾项(bindings、min_completion_ratio、loadCliConfigUnchecked、纯度白名单清零、skeleton src/)。
6. 模板瘦身(不改行为指引;golden 基线随之重生)。
7. 0.4.0 发布。

## Capabilities(预估)

peripheral-commands(r21、r22、r30、r53 等)、review-freeze(r23)、cli(错误前缀、全局旗标)、config-schema(r5/r6 字段删除)、config-command(`--no-interactive` 删除)、change-lifecycle(r40 `--skip-specs` 子句)、init-generators(r70 对账扩展)、monorepo-structure(r3 白名单清零)。

## Impact

- **breaking**:删除旗标(`--skip-specs`、`list --changes`、全局与 `config skills` 的 `--no-interactive`)、删除 schema 字段(`bdd.bindings`、`archive.min_completion_ratio`)、`show --json` 删除 `deltaCount`/`deltas`(不兼容,一步到位)、`graph --format` 非 mermaid 报错。统一在 0.4.0 CHANGELOG 登记迁移说明。
- golden 基线重生(模板改动)。
- 测试 helper 整合不在本变更,另起 quick change。
