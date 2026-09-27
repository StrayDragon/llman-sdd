---
depends_on: []
branch: sdd/align-migrate-dialect
base_branch: main
base_sha: 6ae1a8d1a3d42670183037dc7baa52a43ee5cb44
---

# 迁移输出方言一致并强制解析自检

## Why

issue #3:`spec migrate-native` 对 `# language: en` 方言的 legacy `.feature`(0.4 时代英文关键字 `Feature:`/`Scenario:` + 正文)迁移时,前言(`# language:` 头与 `Feature:` 行)原样保留,而规则/场景块硬编码输出中文关键字(`规则:`/`场景:`)——产物变成 en 前言 + zh-CN 规则关键字的混合方言,官方 Gherkin 解析器两种方言都解析失败;且 dry-run 与退出码均显示成功,无任何告警,事后 `validate --specs` 才抛 `gherkin parse failed`。影响所有非 zh-CN 方言的存量仓库(下游 lspz 实测 11 文件需人工后处理才能过 strict 校验)。

根因:`migrateNativeSource()` 把首行顶层标签前的内容作为 preamble 原样保留,同时硬编码 zh-CN 关键字渲染。

## What Changes

- `analyzeLegacy()` 携带 `parseFeatureSource()` 已解析出的源方言(`language`);`migrateNativeSource()` 按源方言输出规则/场景关键字:zh-CN 源 → `规则:`/`场景:`(现状不变),en 源 → `Rule:`/`Scenario:`,自动嵌套验收场景标题同步本地化(`验收示例` / `Acceptance example`)。前言原样保留——其 `Feature:`/`功能:` 行本就与解析方言一致。
- 步骤关键字本就从源逐字保留,天然方言一致;`@skip` 等标签方言无关。
- 迁移产物 MUST 经官方解析器解析自检:自检失败返回 `ok:false`(不落盘,dry-run 同样报错),不再静默产出不可解析文件。
- 无语言头的文件由既有兜底链(en 起步失败回退 zh-CN,r7)解析定方言,行为一致。
- 不改 CLI 命令面与退出码语义(自检失败走既有 `[error]` 分支,文件不写入)。

## Capabilities

- `specs/spec-parsing`:新增规则 r88(迁移输出方言一致并强制解析自检),含可执行场景。

## Impact

- `packages/core/src/spec/migrateNative.ts`:`analyzeLegacy` 返回结构加 `language`;渲染关键字参数化;产物自检。
- `tests/unit/spec.test.ts`:en 方言 roundtrip(issue #3 MVP)+ zh-CN 回归。
- `tests/bdd/steps/parse.ts` + `llmanspec/specs/spec-parsing.feature`:r88 可执行场景与步骤绑定。
- 下游注意:本修复保持源方言而非归一为 zh-CN——需要 zh-CN 归一的仓库可另行处理;下游此前的人工「en → zh-CN 头规范化」绕过不再必要(保留亦无害)。
