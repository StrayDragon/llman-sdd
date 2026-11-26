# language: zh-CN
# purpose: 定义 Studio CLI-first 双向协商子命令面——纯父分组、原子存储、缺省消歧、只读 Diff/预检/Prompt、评论与修订写回以及带默认分支护栏的语义落盘契约。

功能: studio-cli

  @req:r134
  规则: 纯父分组、原子存储、缺省 state-id 消歧与会话管理
    `llman-sdd studio` MUST 作为纯父分组挂载于 CLI 根命令，裸调不带子命令 MUST 向 stderr 输出用法并以退出码 2 退出；所有 Studio 子命令 MUST 声明并接受 `--directory <path>` 经统一实例根发现解析工作区。
    本地草稿持久化 MUST 经 `makeNodeStudioStateIo(instanceRoot)` 读写 `<instanceRoot>/.llman-sdd/studio/states/<id>.json`，写盘 MUST 走同目录临时文件加原子 `rename`，只读命令 MUST NOT 惰性创建该目录。
    接受可选 `[state-id]` 的子命令在省略参数时 MUST 按精确消歧规则解析：恰好 1 份草稿时自动选中，0 份或多于 1 份 MUST 报域错误（退出码 1）并在多份时列出全部草稿 ID。
    `studio state list` MUST 支持简洁人读文本、`--json` 与 `--compact-json` 输出草稿摘要（无新 TOON 耦合）；`studio state prune` MUST 支持 `--id <state-id>` 删除单条或 `--all` 清空，缺参或互斥组合 MUST 报用法错误（退出码 2）。

    场景: studio 纯父分组裸调、会话列表清理与多草稿消歧
      假如 一个包含多份 Studio 本地草稿的临时仓库
      当 依次运行 studio 裸调、studio state list、缺省 state-id 的 studio diff 与 studio state prune
      那么 studio 裸调退出码为 2 且 stderr 含用法提示
      而且 state list 在 --directory 与 --compact-json 下返回一致草稿摘要
      而且 多草稿省略 state-id 报域错误退出码 1 并列出全部草稿 ID
      而且 state prune 按 --id 与 --all 正确清理本地草稿

  @req:r135
  规则: 只读语义 Diff、图校验预检与结构化 Prompt
    `studio diff [state-id]` MUST 输出各状态机的语义 Diff、未解决评论与基于 `jsdiff` 的内存 Unified Diff 预览，支持 `--json`、`--compact-json`、`--no-unified` 与 `--directory`，MUST NOT 新增 TOON 耦合。
    `studio validate [state-id]` MUST 对草稿内全部活跃状态机执行全量 E1–E4/W1–W2 校验，存在阻断错时 MUST 以退出码 1 退出，支持 `--json`、`--compact-json` 与 `--directory`；传入 `--patch <path|->` 时 MUST 仅在内存预检假设修订补丁而不修改磁盘草稿。
    `studio prompt [state-id]` MUST 向 stdout 输出高信噪比结构化 Agent 协商 Prompt（含草稿 ID、语义 Diff、未解决评论与 CLI 写回回调命令），支持可选 `--copy` 尝试写入系统剪贴板与 `--directory`。

    场景: 只读 diff、validate --patch 预检与 prompt 输出
      假如 一个包含状态机修改草稿与评论的临时仓库
      当 运行 studio diff、studio validate --patch - 与 studio prompt
      那么 studio diff 同时输出语义 Diff、未解决评论与 Unified Diff 且支持 --json
      而且 studio validate --patch - 在不改写磁盘草稿的前提下验证假设修订
      而且 studio prompt 输出含草稿 ID 与 CLI 回调指引的结构化文本

  @req:r136
  规则: 评论回复与非破坏性 Agent 修订建议写回
    `studio comment reply <state-id> <comment-id> --body <text>` MUST 将 Agent 回复原子追加到目标草稿并关联 `replyTo`，传入 `--resolve` 时 MUST 同时将目标评论置为 `resolved`。
    `studio revise <state-id>` MUST 支持从 `--file <path>` 或标准输入读取 JSON 修订载荷（`RevisionOp[]` 或含 `machineKey`/`ops`/`rationale` 的对象）并支持 `--rationale <text>` 与 `--machine <key>`，MUST 仅以 `pending` 状态追加到 `revisions` 建议层而不得覆盖人类草稿 `machines.*.current`；非法 JSON 或非法修订操作 MUST 报用法错误并以退出码 2 退出。

    场景: 评论回复与 revise 建议写回不覆盖人类草稿
      假如 一个包含人类状态机草稿与待回复评论的临时仓库
      当 运行 studio comment reply --resolve、studio revise --file 与非法 JSON 的 studio revise
      那么 目标评论收到 Agent 回复并标记为 resolved
      而且 revise 仅追加 pending 建议层且人类草稿内容零改动
      而且 非法 JSON 载荷报用法错误退出码 2

  @req:r137
  规则: studio apply 语义直写与默认分支强护栏
    `studio apply <state-id>` MUST 先对草稿中全部非移除状态机运行 E1–E4 图校验，存在阻断错时 MUST 拒绝落盘并以退出码 1 退出。
    传入 `--dry-run` 时 MUST 在任意分支（含默认分支）零副作用地输出各目标 `.feature` 的内存 Unified Diff 并以退出码 0 退出。
    未传入 `--dry-run` 时若当前位于默认分支（如 `main`/`master`），MUST 强拦截拒写并以退出码 1 报错提示先执行 `llman-sdd change start <id>` 或使用 `--dry-run`；在绑定的非默认特性分支上 MUST 语义定位目标 `例子:` 表格直写 `.feature`（对文件上方新增行导致的偏移完全免疫），且对 `mode: 'create'` 且缺少 `reqId` 的新建机器 MUST 经 `nextReqId` 分配真实全局 `@req:rN`，落盘后的规格 MUST 通过 `llman-sdd validate`。

    场景: 默认分支拒写、dry-run 预览与特性分支抗行号偏移语义写回
      假如 一个含状态机草稿与新建草稿的临时 git 仓库
      当 在默认分支执行 studio apply 与 --dry-run，再切到特性分支插入 20 行打乱行号后执行 studio apply
      那么 默认分支直接 apply 被拒写退出码 1 且 .feature 零修改
      而且 默认分支 --dry-run 返回 Unified Diff 退出码 0 且 .feature 零修改
      而且 特性分支 apply 在行号偏移 20 行后精准替换例子表、为新建草稿分配真实 reqId 且通过 llman-sdd validate
