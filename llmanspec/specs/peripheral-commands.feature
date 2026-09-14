# language: zh-CN
# capability: peripheral-commands
# purpose: 定义 list/show/graph/spec 助手与 migrate 引导壳的输出合同,验收为同仓库 v1 ↔ v2 活体 golden 归一化对照。
# scope: packages/core/src/report/, apps/cli/src/, tests/golden/check-cli.ts

功能: peripheral-commands

  @req:r20 @human
  场景: list 合同
    - `list --json` MUST 输出 changes 数组,元素字段 MUST 为 name/path/stage/completedTasks/totalTasks/lastModified/idleDays/status;status 枚举 MUST 为 no-tasks(无任务)、complete(全部完成)、in-progress(进行中);人读输出 MUST 按 v1 列布局呈现阶段、任务计数、相对时间与 idle 天数。

  @req:r20 @executable
  场景: 活体 golden 一致
    假如 本仓库的真实 llmanspec 工作区
    当 分别运行 v1 与 v2 的 list/show/graph 命令
    那么 归一化后的输出结构一致

  @req:r21 @human
  场景: show 与 graph 合同
    - `show <change> --output json` 字段集 MUST 覆盖 id/path/title/stage/artifacts/readyToImplement/specsLanded/needsSpecsChange/attached/deltaCount/gateChecks;`show <spec>` MUST 直出头注释与 gherkin 原文;`graph --format mermaid` MUST 以 `flowchart TD` 开头,节点名 MUST 将 `-` 转为 `_`,archived change MUST 标注 `✓ done` 与 archived class,依赖边 MUST 来自 frontmatter depends_on 且指向 archived 节点时同样保留,报告 MUST 以 classDef archived 行收尾。

  @req:r22 @human
  场景: spec 助手与 migrate 引导壳
    - `spec skeleton <cap>` MUST 生成通过单轨校验的骨架(locale 按 config);`spec next-req-id` MUST 扫描全局 rN 注册表输出下一个空闲 id;`project migrate` MUST 输出指向 v1(Rust llman ≤ 0.0.x)的引导文案且不执行任何迁移。
