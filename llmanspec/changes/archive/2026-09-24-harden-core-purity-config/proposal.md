---
depends_on: []
needs_specs_change: true
branch: sdd/harden-core-purity-config
base_branch: main
base_sha: e16d51b928c1ccb837ddbc7373650456cad41067
---

# core 纯度与配置契约加固:副作用注入、死配置清理、判定口径去重

## Why

2026-09-24 全仓审计显示,`packages/core` 的「纯域逻辑、副作用经接口注入」纪律(AGENTS 工程规则 + monorepo-structure r3)在多处被绕开,而现有纯度门禁(`tests/bdd/assert/core-purity.ts`)只查 `node:fs`/`node:child_process` 导入,并把两个违规文件放进了白名单,所以一直是绿的:

- `index.ts` 在 barrel 顶层 `readFileSync` 读 package.json 求 `VERSION`(导入即触发 FS);而 `VERSION` 的唯一消费方是 CLI。
- `archive/sevenzip.ts` 直接 `mkdirSync` 并读 `process.env.LLMAN_SDD_EMBEDDED_7ZZ_WASM_B64`;`templates/embedded.ts` 读 `process.env.LLMAN_SDD_EMBEDDED_TEMPLATES`;`context/indexStore.ts` 把 `process.pid` 与墙钟写进锁文件。
- `config/changeId.ts` 的 nunjucks 环境未显式 `autoescape: false`(AGENTS 硬要求)。

配置契约同样有「能通过校验但毫无效果」的死面:

- `bdd.bindings` 的 `kind: scenario-attrs` 通过 schema 校验却无任何消费方(定案:删除)。
- `bdd.default_language` 的 schema 描述宣称控制 Gherkin 解析语言,实际只注入一个模板变量,且没有任何模板引用它;`bdd.feature_dir` 同样无模板引用。
- `setExtraSkills` 在 CLI 写路径删除(config-command r38)后仍导出且仅被测试使用。
- `change_id.pattern` 的「加载期编译」(r59)只在 CLI 的 `loadCliConfig` 做,core `loadConfig` 与 `loadCliConfigUnchecked` 路径不编译;r59 的 BDD Then 声称验证了「非法正则加载即报错」,实际没有加载非法正则。
- `bdd.run_command` 的 schema 描述需与 validation r13/r48(harness 执行恢复,见 fix-lifecycle-validation-defects)一致。

判定口径重复:`spec add-req` 的规范语义词检查用子串 `includes`(`MUSTARD` 可过),解析器/validate 用词边界正则 `MUST_WORD_RE`,两处会给出相反判定;`localeToGherkinLang` 只被测试调用,skeleton 自己硬编码 `# language: zh-CN`。

## What Changes

Specs landing:`llmanspec/specs/config-schema.feature`、`llmanspec/specs/spec-parsing.feature`、`llmanspec/specs/spec-authoring.feature`。

1. **副作用注入**:`VERSION` 迁出 core(CLI 自行解析);sevenzip 的 wasm 载荷与目录创建、嵌入模板表、索引锁的 pid 与时钟全部由 CLI 注入;changeId nunjucks 显式 `autoescape: false`;纯度门禁扩展到 `process.*` 与无参墙钟,并移除白名单中的 sevenzip / index.ts(`review.ts`、`change/lifecycle.ts` 暂列过渡白名单,由第二波与并行的 A 清零)。
2. **死配置清理(r5 改写)**:删除 `scenario-attrs` 绑定形态(出现即报错并指明已移除)、删除 `bdd.default_language` 与 `bdd.feature_dir` 字段(旧配置残留按未知键宽松忽略);删除 `setExtraSkills`;schema artifact 再生成。
3. **加载期编译(r59 落实)**:core `loadConfig` 编译 `change_id.pattern`,非法即抛 `ConfigValidationError`;r59 验收拆分为「validate 强制」与「加载期报错」两个场景。
4. **判定口径去重**:`add-req` 改用 `MUST_WORD_RE`(r41 与 r9 同口径);skeleton 的 `# language:` 头经 `localeToGherkinLang` 派生(r7 映射获得真实消费方),zh-Hans skeleton 规则体本地化;`nextReqId` 复用 req 注册表而非自行遍历。
5. **gen-schema 漂移门(r6 落实)**:`scripts/gen-schema.ts --check` 支持指定 artifact 路径,补可执行验收(篡改副本必失败)。
6. **补齐可执行验收**:config-schema r5/r6/r59、spec-parsing r7/r9、spec-authoring r41/r43。

## Capabilities

- config-schema(r5 改写;r6/r59 验收补强)
- spec-parsing(r7 改写;r9 验收补强)
- spec-authoring(r41 改写;r43 验收补强)

## Impact

- 配置含 `kind: scenario-attrs` 的项目将加载失败(错误信息指明删除该条目即可);含 `default_language`/`feature_dir` 的旧配置继续可加载,字段被忽略。
- 非法 `change_id.pattern` 将使所有读取配置的命令失败(此前 archive/skeleton/review 路径会静默放行)。
- `@llman-sdd/core` 不再导出 `VERSION`、`setExtraSkills`、`scenarioAttrsBindingSchema`(公开 API 收窄;CLI 同步)。
- 本变更属第一波,与 fix-lifecycle-validation-defects、align-docs-and-gates 并行;独占 `packages/core/src/index.ts`,文件所有权与 req 号段见 design.md §6。
