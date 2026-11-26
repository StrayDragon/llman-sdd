# Tasks: add-studio-mcp-bridge

> 验收 Seam：经 stdio 子进程（或内存配对传输）驱动真实 `llman-sdd studio mcp`，验证 JSON-RPC `stdout` 洁净性、5 个工具完整往返、单/多 worktree 自适应 `directory` 约束与 `--print-config`。

- [ ] T1 引入 `@modelcontextprotocol/server` 并注册 `studio mcp` 命令骨架：在 `apps/cli/package.json` 引入轻量 `@modelcontextprotocol/server`（验证与本仓 `zod@^4.6.7` 类型与运行时无冲突），新增 `apps/cli/src/commands/studioMcp.ts` 挂入 `studio.ts`；实现 `--print-config [client]`（`claude-code`/`cursor`/`codex`/`generic` 退出码 0，非法值退出码 2）与 `--transport http` 显式未实现域错误（退出码 1），补齐 CLI 测试。

- [ ] T2 `[blocked-by: T1]` 实现自适应多 Worktree 解析与 3 个只读工具：实现 `resolveMcpInstanceRoot`（单 worktree 省略 `directory` 自动回退启动目录/客户端 roots；通过 `worktreeList()` 检测到多 worktree 且未显式钉死时程序级拦截并列出全部 worktree 路径）；挂接 `studio_list_states`、`studio_get_diff`、`studio_validate_draft`（统一回显 `{ instanceRoot, branch }`），补齐单/多 worktree 传输测试。

- [ ] T3 `[blocked-by: T2]` 实现 2 个写回协商工具：挂接 `studio_reply_comment` 与 `studio_propose_revision`，复用 C2 原子存储适配器读写 `.llman-sdd/studio/states/<id>.json`（确保建议层不直接覆盖人类草稿且绝不暴露直写 `llmanspec/specs/` 工具），补齐 5 工具完整往返与并发安全测试。

- [ ] T4 `[blocked-by: T3]` 验证 stdio `stdout` 洁净性与全仓门禁：构造含 legacy 配置 WARNING 的临时仓库驱动 `studio mcp`，断言 `stdout` 逐行皆为合法 JSON-RPC 帧且警告仅落 `stderr`，运行全仓 `just qa` 验证全绿。
