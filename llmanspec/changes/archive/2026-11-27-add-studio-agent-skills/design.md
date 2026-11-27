# Design: Studio Agent 轻量协作 Skill 套件

## D1 收敛为 2 份精炼 0-STC 技能（契合轻量技能路线）

为避免新增过多技能增加模型发现噪音与上下文占用，将原 3 个设想合并为 2 份短小精悍的技能模板（均保持 0 STC 错误，严格遵守 `r97` 四级中文强度词表与 `r67` 真实 CLI 命令面）：

1. **`packages/core/templates/zh-Hans/skills/llman-sdd-studio-onboard.md`**：
   - 场景：新项目冷启动接入 Studio，或接手陌生/开源仓库需快速反向提炼领域图谱；
   - 内容：反向梳理领域边界与 4 类规格（状态机 `@transitions` / 流程图 / 决策真值表 / 规则文档）→ 按方言 Linter（`E1–E4` / `F1–F4`）自检 → 启动 `llman-sdd studio open`（可对比 `--demo` 自举样例）并提示多 Worktree 同 Hub 自动按路径隔离。
2. **`packages/core/templates/zh-Hans/skills/llman-sdd-studio-collab.md`**：
   - 场景：消费 Studio 导出 Prompt、透明 HTTP GET 深链、处理评论/修订层或协助图规格体检与沉淀变更（合并原 `collab` + `review`）；
   - 内容：只引用真实 CLI 命令（`llman-sdd studio diff`、`llman-sdd studio validate`、`llman-sdd studio comment reply`、`llman-sdd studio revise`、`llman-sdd studio apply --dry-run`），以 `studio comment reply` 承载结构化“意图不可达/冲突回执”，绝不虚构不存在的子命令；明确默认分支只读红线与三出口（切可写 Worktree / 开 Change 分支 / 仅导 `proposal.md`）。

## D2 不污染 `llman-sdd-wayfinder`

`llman-sdd-wayfinder` 专职跨会话大型决策地图规划，不承担通用技能路由；多 Worktree 与 Studio 协作提示直接内聚在 `llman-sdd-studio-onboard` 与 `llman-sdd-studio-collab` 内。

## D3 模板门禁与基线同步

- 注册至 `packages/core/src/templates/skills.ts` 的 `OPTIONAL_SKILL_FILES`（17 → 19）；
- 在 `scripts/stc-baseline.json` 为 2 份新模板登记基线 `0`；
- 更新 `tests/unit/templates.test.ts`（17 → 19 + 包含断言）；
- 运行 `llman-sdd init --update` 刷新 `.agents/skills/` 并运行 `bun run generate:skills-template-baseline` 更新 `tests/golden/baseline/`。
