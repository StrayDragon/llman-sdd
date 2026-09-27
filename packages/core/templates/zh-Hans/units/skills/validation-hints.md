校验修复（单轨 feature-as-spec）：

1）缺头注释（`missing # capability: header comment`）：每个 capability `.feature`（`llmanspec/specs/<capability>.feature` 或目录内同名主文件）必须以下列注释开头：
```
# language: zh-CN
# capability: <capability>
# purpose: 一句话概述
# scope: src/
```

2）tag 语法（`rule scenario must carry an @req:<req_id> tag` / `@rule 与 @executable 互斥` / `orphan acceptance scenario`）：
- 规则：`@req:<id> @rule`——statement 全文放场景描述；纯人工约束用 `@req:<id> @rule @human`（须含 MUST/SHALL）。
- 验收/可执行：`@executable` + 至少一个 `@req:<id>` 挂回规则——默认首选形态，步骤绑定 BDD 代码。
- 分流判据（**优先 executable、尽可能减少 @rule 定义**）：凡 GWT（假如/当/那么）可表达、绑定步骤代码的自动化判定行为 MUST 落 `@executable` 并挂回规则（纯文字规则无行为守护）；抽象目标/架构决策等不可自动化的人工约束用 `@rule @human`，无法配对时在 proposal/design 记录理由；暂不转写用 `@rule` 锚点并 MUST 挂 `@executable` 验收。
- 禁止 `@rule` 与 `@executable` 同场景；禁止 `@human` 与 `@executable` 同场景；`@manual` 已在 0.3.0 移除——残留报迁移 ERROR，删掉即可。

分支护栏：
- 先 `change start` / `attach` 绑定分支，再在绑定的非默认分支编辑 `.feature` 并 commit（落地 specs）。
- 锁定规则（报告制）：改/删既有 `@rule`/`@human` 规则场景只出 WARNING，不阻断 validate / finalize / `change diff`；报告按 `@req:<id>` 指明被改规则。控制点：git 分支对比 + `llman-sdd review` / `change diff`。旧锁定确认元数据（frontmatter `rules_touched` / `agent_acked`、`@agent` tag、`--yes` 确认语义）已全部删除，无别名无兼容层。
- `stage=full` 且 specs-landed 门通过（specsLanded ∨ `needs_specs_change: false`）即可进 apply；verify/finalize 须 `readyToImplement=true`（完成信号）。收口优先 `change finalize`。
