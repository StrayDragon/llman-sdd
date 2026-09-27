## 单轨 Feature 合约规范

每个 capability 只有一个 Gherkin 文件：扁平 `llmanspec/specs/<capability>.feature`（默认）或目录 `llmanspec/specs/<capability>/` 内同名主文件——二选一，同 id 两布局并存算冲突。它是唯一的 spec 工件（不存在 `spec.toon`）。

```gherkin
# language: zh-CN
# capability: sample
# purpose: One-line overview.
# scope: src/

功能: sample

  @req:r1 @executable
  场景: happy
    假如 a precondition
    当 a trigger happens
    那么 the outcome is observed

  @req:r2 @rule
  场景: Rule title
    System MUST do something (not yet converted to steps). Longer requirement
    clauses span multiple description lines without any list marker — the
    statement is read verbatim, so multi-line prose keeps it reviewable.

  @req:r3 @rule @human
  场景: Governance constraint
    评审者 MUST 人工裁决该抽象目标的合理性。
```

- 头注释（`# capability:` / `# purpose:` / `# scope:`）必填；`scope` 驱动过期检查。
- **优先 `@executable`**：行为以 `假如/当/那么` 步骤表达并绑定 BDD 步骤代码、由 runner 执行——默认首选，尽可能减少 `@rule` 定义。
- `@rule` 规则场景承载无法程序化表达（抽象目标、架构决策、治理）或暂不转写的需求：statement 全文放场景描述；可自动化锚点 MUST 挂 `@executable` 验收。`@rule @human` 是纯人工约束（statement 须含 MUST/SHALL）。`@rule` 与 `@executable` 同场景互斥。
- statement（`@rule`/`@rule @human`/`@human` 描述）较长时拆成多行描述便于审查，不使用 `- ` 列表前缀（无 bullet 直达 statement 文本）；描述行不得以 `假如/当/那么/而且` 等步骤关键字开头（会被解析为步骤）。
- 改/删既有 `@rule`/`@human` 规则场景只出 WARNING（报告制，不阻断门禁），用 git 分支对比审视；旧锁定确认元数据 `rules_touched` / `agent_acked` / `@agent` 已删除，无别名无兼容层。
- `@executable` 场景是 runner 验收：用 `@req:<req_id>` 挂回规则。
- 覆盖分级：enforced（有验收）/ pending——`list --specs` 逐项输出。
- 场景 MUST 保持顶层：`Rule:` 块会被拒绝（runner 静默跳过其中场景）。
