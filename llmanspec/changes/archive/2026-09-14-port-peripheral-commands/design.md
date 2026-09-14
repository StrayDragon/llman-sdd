# Design

## 验收策略:活体 golden(本仓库实时对照)

`tests/golden/check-cli.ts`:在同一仓库分别运行 v1 与 v2 的目标命令,输出经归一化后做**结构化对比**:
- JSON 输出:parse 后深比较(规避键序/空白差异)
- 文本输出:逐行归一化——相对时间(`2h ago`/`just now`)→ `<REL>`,ISO 时间戳 → `<TS>`,ISO 日期 → `<DATE>`
覆盖:`list`、`list --json`、`list --specs`、`show <draft-change> --output json`、`show <capability> --type spec`、`graph --format mermaid`。v1 stderr 的 INFO 行(分支领先提示)不计入。

## 命令实现(packages/core/src/report + apps/cli)

- `collectChanges(io, maxScanDepth)`:扫 `llmanspec/changes/*/proposal.md`(不入 archive),解析 stage(draft/designed/planned/full 按 artifacts+binding)、tasks 完成 `.bounce` 计数(mtime 取文件最新修改时间;JS 毫秒精度输出 ISO,v1 为纳秒——归一化层吸收)
- `statusFor(total, completed)`:0 任务 → `no-tasks`;completed==total 且 total>0 → `done`;否则 `in-progress`
- `graphMermaid(entries)`:节点 id `-`→`_`;archived(读 `changes/archive/` 目录名剥日期前缀)标 `✓ done` + `:::archived`;边来自 proposal frontmatter `depends_on`;首行 `flowchart TD`,尾行 `classDef archived fill:#d4edda,stroke:#28a745,color:#333`
- `show change --output json`:字段集与嵌套 gateChecks 对齐 v1(结构见活体 golden)
- `show spec`:头注释 + gherkin 原文直出
- `spec skeleton <cap>`:locale 按 config(zh-Hans → 中文骨架),格式同 v1(经 spec-parsing 校验)
- `spec next-req-id`:扫全部 specs 的 rN 取最大 +1,输出 `r<N>`
- `project migrate`:固定引导文案(指向 v1),退出码 0

## CLI

`apps/cli` 增 `list/show/graph/spec/project` 命令组,旗标与 v1 同名。

## 测试策略

单元(阶段判定/status/graph sanitize/id 推导)+ 活体 golden 对照脚本 + BDD `@executable`(驱动 CLI)。
