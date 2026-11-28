# Design: 超薄 Studio MCP 包装壳与有状态扩展入口

本设计锁定 `add-studio-mcp-bridge`（C4）的依赖边界、工具契约、自适应多 worktree 防串仓约束与 stdio 传输纪律。C4 严守 **“超薄包装壳”** 原则：零业务逻辑复制，全部核心状态读写、语义 Diff 与校验均直接复用 C1（`packages/core/src/studio/*`）与 C2（`makeNodeStudioStateIo`）。

---

## D1 模块结构与依赖选型

- **协议依赖**：在 `apps/cli/package.json` 引入轻量 **`@modelcontextprotocol/server`**（原生兼容本仓 `zod@^4.6.7`，仅含服务端运行时，避免旧版 monolithic SDK 的 Zod v3 冲突与多余客户端体积）。
- **代码落点**：新增 `apps/cli/src/commands/studioMcp.ts`，挂入 `apps/cli/src/commands/studio.ts` 作为 `llman-sdd studio mcp` 子命令。
- **数据互通**：直接读写同一路径 `<instanceRoot>/.llman-sdd/studio/states/<stateId>.json`（经 C2 原子写入适配器），确保 MCP 写入的评论回复与修订建议被 C3 Studio Web 的文件监听秒级感知。

---

## D2 精简工具集（5 个高频工具，严控 Schema Token 税）

仅暴露 5 个与 CLI 协商面一一对应的核心工具，刻意不暴露直接改写 `llmanspec/specs/` 的写入工具（真理落盘始终经人类在绑定分支确认）：

| MCP 工具名 | 复用核心/CLI 能力 | 入参要点 | 返回要点 |
| --- | --- | --- | --- |
| `studio_list_states` | C2 `studio state list` | `directory?` | `{ instanceRoot, branch, states[] }` |
| `studio_get_diff` | C2 `studio diff` | `stateId?`, `includeUnified?`, `directory?` | `{ instanceRoot, branch, stateId, semanticDiff, comments, unifiedDiff? }` |
| `studio_validate_draft` | C2 `studio validate` | `stateId?`, `patchOps?`, `directory?` | `{ instanceRoot, branch, ok, diagnostics[] }` |
| `studio_reply_comment` | C2 `studio comment reply` | `stateId`, `commentId`, `body`, `resolve?`, `directory?` | `{ instanceRoot, branch, comment }` |
| `studio_propose_revision` | C2 `studio revise` | `stateId`, `machineKey`, `rationale`, `ops[]`, `directory?` | `{ instanceRoot, branch, revision, previewDiff }` |

- 缺省 `stateId` 沿用 C2 消歧规则（恰好 1 份自动选中，0 份或多份返回清晰错误提示显式指定）。

---

## D3 自适应多 Worktree 防串仓约束

为同时做到“单仓零摩擦”与“多 worktree 绝不写错仓”，`resolveMcpInstanceRoot(inputDirectory, defaults)` 执行以下确定性策略：

1. **显式传入 `directory`**：直接经 `resolveInstanceRoot(directory)` 解析（找不到有效 `llmanspec/` 根时报域错误）。
2. **未传入 `directory`**：
   - 取默认起点（优先 CLI 启动 `--directory`，其次 MCP 客户端声明的唯一 root，再次进程启动 `cwd`）；
   - 通过 `packages/core` 既有 `worktreeList()` 枚举当前仓库关联的有效 worktree 列表（非 Git 目录或 `worktreeList` 失败时视作单仓）；
   - 若有效 worktree 数量 **大于 1** 且未在启动期经 `--directory` 显式钉死目录 → **程序级拦截**，返回结构化错误列出全部可用 worktree 路径，要求调用方在工具参数中显式传入 `directory`；
   - 若仅单 worktree → 无摩擦使用默认根。
3. **响应透明回显**：所有 5 个工具的成功返回均包含 `instanceRoot` 与 `branch`，供 Agent 随时核对上下文。

---

## D4 传输纪律、`--print-config` 与有状态扩展槽位

- **`--transport stdio`（MVP 默认）**：
  - `stdout` **严禁输出任何非 JSON-RPC 内容**；所有运行提示、配置迁移 WARNING 与异常堆栈一律定向到 `stderr`。
- **`--print-config [client]`**：
  - 支持 `claude-code`、`cursor`、`codex`、`generic`（缺省 `generic`）；
  - 向 `stdout` 打印可直接粘贴的 JSON/TOML 配置片段后立即以退出码 `0` 退出（不阻塞等待 stdio）；非法 client 名报用法错退出码 `2`。
- **有状态扩展预留**：
  - 保留 `--transport <stdio|http>` 参数面（MVP 传入 `http` 时返回清晰的未实现域错误退出码 1，不静默回落 stdio），为后续接入 Streamable HTTP 及 `resources/subscribe`（画布主动呼叫 Agent / 当前焦点同步）预留协议接口，不破坏现有工具名。

---

## 测试边界（Seam）

C4 的验收 seam 为经子进程 stdio（或内存配对传输）驱动真实 `llman-sdd studio mcp`：
- **协议洁净性**：启动后收发标准 JSON-RPC `initialize` / `tools/list` / `tools/call`，断言 `stdout` 逐行皆为合法 JSON-RPC 帧（即使触发 legacy 配置 WARNING 亦仅出现在 `stderr`）；
- **5 工具完整往返**：在临时仓库跑通 `list_states` → `get_diff` → `validate_draft` → `reply_comment` → `propose_revision`，核验 `.llman-sdd/studio/states/<id>.json` 内容原子更新且无覆盖人类草稿；
- **自适应多 Worktree 约束**：单仓省略 `directory` 正常返回且带 `{ instanceRoot, branch }`；挂载第二个 linked worktree 后省略 `directory` 被拦截并列出全部 worktree 路径，显式传目标 `directory` 后精准命中；
- **`--print-config`**：覆盖 4 类 client 输出格式合法且退出码 `0`，非法 client 退出码 `2`。
