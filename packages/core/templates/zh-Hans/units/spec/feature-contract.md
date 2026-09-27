## 单轨 Feature 合约规范(原生 Gherkin 分层)

每个 capability 只有一个 Gherkin 文件：扁平 `llmanspec/specs/<capability>.feature`（默认）或目录 `llmanspec/specs/<capability>/` 内同名主文件——二选一，同 id 两布局并存算冲突。它是唯一的 spec 工件（不存在 `spec.toon`）。

格式使用**原生 Gherkin 分层**：`功能:` → `规则:`（需求：标题 + 自由文本描述 + `@req:<id>` 句柄）→ 嵌套 `场景:`（可执行 GWT 示例）。这是唯一的规范样式；历史标签（`@executable`/`@rule`/`@human`/`@manual`）不再使用，旧文件以 `spec migrate-native` 迁移。

```gherkin
# language: zh-CN
# capability: sample
# purpose: One-line overview.
# scope: src/

功能: sample

  @req:r1
  规则: 描述一个需求要点
    需求文本自由书写(不强制 MUST/SHALL 词),较长时拆多行便于人/agent 阅读。
    第二行继续,描述行不得以 假如/当/那么/而且 开头(会被解析为步骤)。

    场景: 一个可执行示例
      假如 a precondition
      当 a trigger happens
      那么 the outcome is observed

  @req:r2
  规则: 暂不转写的需求(裸规则,会被聚合计数提示转写)
    描述即现状需求的唯一载体;没有嵌套场景的规则计入裸规则聚合计数,交由
    specs-compact 持续压降。
```

- 头注释（`# capability:` / `# purpose:` / `# scope:`）必填；`scope` 驱动过期检查。
- **可执行场景优先**：行为一律以嵌套 `场景:`（假如/当/那么）表达并绑定 BDD 步骤代码、由 runner 执行——默认首选。仅当需求无法程序化表达（抽象目标、架构决策、治理/人工约束）或暂不转写时，才以 `规则:` 块承载，并在 proposal/design 记录理由。
- `@req:<id>` 挂在 `规则:` 头标签，是全局唯一的需求句柄（resolve-req/next-req-id/条款引用共用）；重复或缺失由 validate 判 ERROR。
- 规则描述为自由文本：不强制 MUST/SHALL 词；较长时拆多行便于审查，不使用 `- ` 列表前缀（会原样进入描述）。
- 不在任何 `规则:` 内的顶层 `场景:` 是功能级示例(Gherkin 原生允许,无规则句柄、不告警、不参与规则统计);无嵌套场景的 `规则:` 是裸规则(聚合计数 INFO,`--include-info` 可见,review `pending` 信号计量)。
- 改/删既有 `规则:` 只出 WARNING（报告制，不阻断门禁），用 git 分支对比审视；旧锁定确认元数据 `rules_touched` / `agent_acked` / `@agent` 已删除，无别名无兼容层。
- 覆盖分级：enforced（含嵌套场景）/ pending（裸规则）——`list --specs` 逐项输出。
- `规则:` 块是标准容器：嵌套 `场景:` 会被 runner 执行；两空格缩进层级（块 `规则:` 2 格、嵌套 `场景:` 4 格、步骤 6 格）。
