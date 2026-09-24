校验修复（单轨 feature-as-spec）：

1）缺头注释（`missing # capability: header comment`）：每个 capability `.feature`（`llmanspec/specs/<capability>.feature` 或目录内同名主文件）必须以下列注释开头：
```
# language: zh-CN
# capability: <capability>
# purpose: 一句话概述
# scope: src/
```

2）tag 语法（`@human constraint scenario must carry an @req:<req_id> tag` / `orphan acceptance scenario`）：
- 规则：`@req:<id> @human`——statement 全文放场景描述（须含 MUST/SHALL）。
- 验收：`@executable` + 至少一个 `@req:<id>` 挂回规则。
- 配对判据：新增 `@human` 前先分流——凡 GWT 可表达的自动化判定行为 MUST 落 `@executable` 验收并挂回规则（纯文字规则无行为守护）；`@human` 仅用于不可自动化的人工约束，无法配对时在 proposal/design 记录理由。
- 禁止 `@human` 与 `@executable` 同场景；`@manual` 已在 0.3.0 移除——残留报迁移 ERROR，删掉即可（`@human` 本身已承载人工判定语义）。

分支护栏：
- 先 `change start` / `attach` 绑定分支，再在绑定的非默认分支编辑 `.feature` 并 commit（落地 specs）。
- 锁定规则（报告制）：改/删既有 `@human` 场景只出 WARNING，不阻断 validate / finalize / `change diff`；报告按 `@req:<id>` 指明被改规则。控制点：git 分支对比 + `llman-sdd review` / `change diff`。旧锁定确认元数据（frontmatter `rules_touched` / `agent_acked`、`@agent` tag、`--yes` 确认语义）已全部删除，无别名无兼容层。
- `stage=full` 且 specs-landed 门通过（specsLanded ∨ `needs_specs_change: false`）即可进 apply；verify/finalize 须 `readyToImplement=true`（完成信号）。收口优先 `change finalize`。
