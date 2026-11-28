# Design: Studio CLI-first 双向协商子命令与 Skill 引导

本设计锁定 `add-studio-cli-negotiation`（C2）在 `apps/cli/` 与 `packages/core/templates/` 中的命令面、参数契约、分支护栏与测试边界。所有核心图模型、语义 Diff、校验与 `.feature` 渲染均直接复用 C1（`add-studio-domain-core`），CLI 层严守零业务逻辑重复与 `cli.feature` 全套纪律。

---

## D1 纯父分组命令树与 `cli.feature` 对齐

`llman-sdd studio` 作为第 5 个纯父分组挂载于 `apps/cli/src/program.ts`（与 `change` / `spec` / `project` / `self` 严格一致：**裸调不带子命令向 stderr 报用法错并以退出码 `2` 退出**）。

| 命令 | 用途 | 关键选项 |
| --- | --- | --- |
| `studio diff [state-id]` | 只读查看草稿语义 Diff、未解决评论及基于 `jsdiff` 的内存 Unified Diff 预览 | `--json`, `--compact-json`, `--no-unified`, `--directory <path>` |
| `studio validate [state-id]` | 对草稿运行 C1 全量 E1–E4 图校验；可预检假设修订补丁而不改草稿 | `--patch <path\|->`, `--json`, `--compact-json`, `--directory <path>` |
| `studio prompt [state-id]` | 向 stdout 输出面向 Agent 的高信噪比结构化 Prompt（含草稿 ID、语义 Diff、评论与 CLI 回调指引） | `--copy`, `--directory <path>` |
| `studio comment reply <state-id> <comment-id>` | Agent 写回评论回复，写入 `.llman-sdd/studio/states/<id>.json` 供 Studio 网页实时刷新 | `--body <text>`（必填）, `--resolve`, `--directory <path>` |
| `studio revise <state-id>` | 从 stdin 或 `--file` 读取 JSON `RevisionOp[]` 写入独立建议层（不覆盖人类草稿） | `--file <path>`, `--rationale <text>`, `--directory <path>` |
| `studio state list` | 列出 `.llman-sdd/studio/states/` 下所有本地草稿摘要（ID、标题、机器数、更新时间） | `--json`, `--compact-json`, `--directory <path>` |
| `studio state prune` | 清理本地草稿（支持按 `--id <state-id>` 删除单条或 `--all` 清空） | `--id <state-id>`, `--all`, `--directory <path>` |
| `studio apply <state-id>` | 语义定位目标 `.feature` 场景并直写更新后的 `例子:` 表格（不依赖行号 patch） | `--dry-run`, `--directory <path>` |
| `studio serve` / `open` / `stop` | *(预留给 C3 挂载)* 按需单实例复用 Hub（`127.0.0.1:4710`）与 `--foreground` 本地调试托管，支持多仓/多 Worktree/子项目 `llmanspec/` 注册与一键切换 | *(由 C3 定义)* |

- **零新 TOON 耦合**：本组新命令缺省输出简洁人读文本/Markdown，机器消费提供 `--json` 与 `--compact-json`（不额外设计新 TOON 输出格式）。
- **错误与退出码**：统一收敛到主入口渲染单一 `Error: <message>` 前缀——参数/用法错退出码 `2`，域错误（找不到实例根、找不到草稿、E1–E4 校验失败、默认分支拒写）退出码 `1`，成功退出码 `0`。
- **缺省 `[state-id]` 消歧规则**：省略 `[state-id]` 时，若 `.llman-sdd/studio/states/` 中恰好只有 1 份草稿则自动选中；0 份报域错误提示创建/启动 Studio，多于 1 份报域错误列出全部 ID 要求显式指定（绝不静默瞎猜）。

---

## D2 CLI 文件系统适配器与原子并发写盘

- 新增 `apps/cli/src/commands/studio.ts`，所有草稿持久化经 `makeNodeStudioStateIo(instanceRoot)` 注入 C1 纯域：
  - 存储根目录固定为 `<instanceRoot>/.llman-sdd/studio/states/`；
  - 写入统一走「写同目录 `.tmp.<pid>.<rand>` → `renameSync` 原子替换」，确保 CLI 写回评论/修订建议与 C3 Studio Web 文件监听同时工作时永不读到半截 JSON；
  - 仅在 `studio comment reply` / `studio revise` 等写命令触发时惰性创建 `.llman-sdd/studio/states/` 目录，只读命令零目录创建副作用。

---

## D3 `studio apply` 的语义直写与默认分支强护栏

`llman-sdd studio apply <state-id>` 的执行步骤严格按以下顺序：

1. **加载与校验**：读出目标 `StudioStateDoc`，对其中全部 `machines` 运行 `validateMachineGraph`；存在任意 E1–E4 阻断错时**直接拒绝**（退出码 1 并打印全部错误定位）。
2. **纯内存语义渲染与预览**：对每张机调 C1 的 `renderUpdatedFeatureSource(currentFileText, draft)`（按 Gherkin 规则/场景语义定位 `例子:` 表格块直接替换，**不依赖行号或游离 patch**，文件其他位置的增删与注释不受影响），并用 `previewFeatureUnifiedDiff` 计算行级对比。
3. **`--dry-run` 短路出口**：若传入 `--dry-run`，直接向 stdout 打印各目标 `.feature` 的 Unified Diff 预览并返回退出码 `0`（**任意分支、包括 `main` 均可用，零磁盘写入**）。
4. **默认分支强护栏（非 `--dry-run`）**：
   - 调用既有 `currentBranch` 与 `defaultBranch` 检查当前仓库分支；
   - 若处于默认分支（如 `main` / `master`），**强拦截拒写**，以退出码 `1` 返回清晰域错误：`refusing to write llmanspec/specs/ on default branch '<branch>'; run 'llman-sdd change start <id>' first (or pass --dry-run to preview)`；
   - 若位于已绑定的非默认特性分支（或独立 worktree），将新文本写入对应 `llmanspec/specs/<cap>.feature`（`mode: 'create'` 且文件不存在时自动创建），并输出受影响文件列表与下一步指引（`llman-sdd validate` + `git commit`）。

---

## D4 Skill 模板与 Golden 基线同步

- 在 `packages/core/templates/` 下的 `llman-sdd-explore` 与 `llman-sdd-propose` 模板中补充简明 Studio 协商指引（约 5–8 行）：收到携带 Studio 草稿 ID 的任务时，优先通过 `llman-sdd studio diff / validate / comment reply / revise` 完成双向核验；禁止在默认分支直接修改 `llmanspec/specs/`。
- 实施时按 `llmanspec/AGENTS.md` 工程规则：同步运行 `init --update` 刷新 `.agents/skills/`，并更新 `tests/golden/` 基线确保 `check:skills-template-render` 变绿。

---

## 测试边界（Seam）

C2 的验收 seam 为经 `tests/helpers/` 拉起的真实 `llman-sdd` CLI 子进程 + 临时仓库（覆盖 `tests/unit/` 适配单测 + `tests/bdd/` 可执行场景）：
- **CLI 契约**：`llman-sdd studio` 裸调退出码 `2` 且含 `Usage:`；全部子命令 `--directory <path>` 跨目录解析一致；多草稿缺省 ID 消歧报域错误退出码 `1`。
- **完整协商往返**：`studio diff` → `studio validate --patch -` → `studio comment reply` → `studio revise --file` → `studio prompt` → 核验 `.llman-sdd/studio/states/<id>.json` 内容原子更新无损坏。
- **`studio apply` 护栏与行号抗偏移**：
  - 在 `main` 分支跑 `studio apply` 被强拦截（退出码 `1`，`.feature` 零修改）；
  - 在 `main` 分支跑 `studio apply --dry-run` 成功输出 Unified Diff（退出码 `0`，`.feature` 零修改）；
  - `change start` 切到特性分支后，先在目标 `.feature` 上方手工插入 20 行其他规则打乱行号，再运行 `studio apply` → 依然精准替换目标 `例子:` 表且注释与其他规则完好无损，运行 `llman-sdd validate` 全绿！
