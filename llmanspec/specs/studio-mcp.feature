# language: zh-CN
# purpose: 定义超薄 Studio MCP 包装壳（llman-sdd studio mcp）的命令面、配置引导、自适应多 Worktree 防串仓、5 工具协商契约与 stdio 协议洁净性。

功能: studio-mcp

  @req:r139
  规则: studio mcp 命令面、--print-config 与传输预留
    `llman-sdd studio mcp` MUST 挂载于 `studio` 纯父分组下，声明 `--directory <path>`、`--transport <stdio|http>`（缺省 `stdio`）与 `--print-config [client]`。
    传入 `--print-config [client]`（支持 `claude-code`、`cursor`、`codex`、`generic`，缺省 `generic`）MUST 向 `stdout` 输出可直接粘贴的 MCP 配置片段后立即以退出码 0 退出且不阻塞等待 stdio；传入非法 client 名 MUST 报用法错误并以退出码 2 退出。
    传入 `--transport http` MUST 返回显式未实现域错误并以退出码 1 退出（不得静默回落 `stdio`）；传入非法 `--transport` 值 MUST 报用法错误并以退出码 2 退出。

    场景: studio mcp --print-config 与 --transport 边界
      假如 本仓库的真实 llmanspec 工作区
      当 依次运行 studio mcp --print-config 的 4 类合法 client、非法 client 与 --transport http
      那么 4 类合法 client 均输出有效配置且退出码为 0
      而且 非法 client 退出码为 2
      而且 --transport http 退出码为 1 且 stderr 含未实现提示

  @req:r140
  规则: 自适应多 Worktree 防串仓解析与上下文回显
    `resolveMcpInstanceRoot` 在工具入参显式提供 `directory` 时 MUST 直接经 `resolveInstanceRoot` 解析实例根（无有效 `llmanspec/` 根时报域错误）。
    工具入参省略 `directory` 时 MUST 取默认起点（优先启动期 `--directory`，其次 MCP 客户端声明的唯一 root，再次进程启动 `cwd`）并经 `worktreeList()` 检查当前仓库关联的有效 worktree 数量（非 Git 目录或检查失败时视作单仓）；当有效 worktree 数量大于 1 且启动期未以 `--directory` 显式钉死目录时，MUST 程序级拦截调用并返回列出全部有效 worktree 路径的结构化错误。
    全部 MCP 工具的成功响应 MUST 回显 `{ instanceRoot, branch }` 上下文字段。

    场景: 单 worktree 零摩擦解析与多 worktree 强制 directory 拦截
      假如 一个含 Studio 本地草稿并可扩展第二链接 worktree 的临时 git 仓库
      当 通过 studio mcp 在单 worktree 省略 directory、挂载第二 worktree 后省略 directory 与显式传目标 directory 分别调用 studio_list_states
      那么 单 worktree 省略 directory 成功返回草稿列表并回显 instanceRoot 与 branch
      而且 多 worktree 省略 directory 被程序级拦截且错误信息列出全部 worktree 路径
      而且 显式传入目标 worktree directory 后精准命中目标仓草稿

  @req:r141
  规则: 5 个精简协商工具契约与零直写 specs 护栏
    Studio MCP Server MUST 仅暴露 5 个核心工具：`studio_list_states`、`studio_get_diff`、`studio_validate_draft`、`studio_reply_comment`、`studio_propose_revision`，MUST NOT 暴露任何直接改写 `llmanspec/specs/` 的工具。
    只读工具（`studio_list_states`、`studio_get_diff`、`studio_validate_draft`）MUST 直接复用核心域与 `makeNodeStudioStateIo` 读取 `.llman-sdd/studio/states/`；省略 `stateId` 时沿用单草稿自动选中、0 份或多份报错的消歧规则；`studio_validate_draft` 支持可选 `patchOps` 在内存预检而不改写磁盘草稿。
    写回工具（`studio_reply_comment`、`studio_propose_revision`）MUST 经 `makeNodeStudioStateIo` 原子落盘；`studio_propose_revision` MUST 仅以 `pending` 状态追加到 `revisions` 建议层并返回 `previewDiff`，不得覆盖人类草稿 `machines.*.current`。

    场景: 5 个 MCP 工具完整往返且人类草稿与 specs 零直改
      假如 一个含状态机修改草稿与待回复评论的临时 git 仓库
      当 通过 stdio JSON-RPC 依次调用 tools/list 与全部 5 个 Studio MCP 工具
      那么 tools/list 恰好暴露 5 个核心工具且无任何直写 specs 工具
      而且 只读工具返回语义 Diff、评论与带 patchOps 预检结果且不改写磁盘草稿
      而且 写回工具原子持久化评论回复与 pending 修订建议且人类草稿与 specs 文件零改动

  @req:r142
  规则: stdio 传输 stdout 协议洁净性
    在默认 `stdio` 传输模式下，`stdout` MUST 严格仅输出合法的 JSON-RPC 帧（逐行可被 `JSON.parse`），任何运行提示、异常堆栈或配置迁移 WARNING（含 legacy `bdd:` 告警）MUST 全部定向至 `stderr`。

    场景: 含 legacy 配置 WARNING 时 studio mcp stdio stdout 仍逐行合法 JSON-RPC
      假如 一个含 legacy bdd 配置与 Studio 草稿的临时 git 仓库
      当 启动 studio mcp 并经 stdio 收发 initialize 与 studio_list_states 请求
      那么 stdout 每一非空行均为合法 JSON-RPC 帧且不含 WARNING 文本
      而且 legacy 配置 WARNING 仅出现在 stderr
