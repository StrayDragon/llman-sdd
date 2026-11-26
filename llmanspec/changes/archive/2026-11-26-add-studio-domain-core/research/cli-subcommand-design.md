# `llman-sdd studio` 子命令面设计草案

> 性质：CLI 命令面设计草案（用于深挖与对齐 `llmanspec/specs/cli.feature` 契约，尚未冻结）。整理日期：2026-11-25。

---

## 1. 现状核查与前置事实（2026-11-25）

在设计子命令与开箱体验前，先锚定两项刚刚核实过的本仓事实：

1. **本仓 `llmanspec/specs/` 当前有 `0` 张活跃的状态流转表**：
   - 在提交 `ad71a3b`（`clarify-transition-gate-specs`）中，`change-lifecycle.feature` 原先的 `@req:r34` 已对齐真实实现 `stageFor(hasDesign, hasTasks, hasBinding)`，改写为**文件组合决策表**（不再被嗅探为状态流转表）；
   - `packages/core` 已移除不参与判定的 `xstate` 直接依赖，校验引擎仅保留 `@statelyai/graph`；
   - `validation.feature` 已将状态流转规则拆为 `@req:r104`（tag 定界）+ `@req:r124–r127`（四道门禁），全部样例放在 `tests/bdd/steps/validation.ts` 的临时仓库夹具里。
   - **对 Studio 设计的影响**：任何真实项目初期（包括本仓自己）都可能暂时是 0 张 `@transitions` 表。因此 `llman-sdd studio` 必须把 **“零状态机空态引导 + `--demo` 内置样例模式”** 做成一等体验，同时后续也应考虑如何展示决策表/普通规则上下文。
2. **必须严格遵守的本仓 CLI 契约（`llmanspec/specs/cli.feature`）**：
   - **错误与退出码（`@req:r75`）**：统一主入口渲染单一 `Error: ` 前缀；用法/参数错退出码 `2`，域错误退出码 `1`，帮助退出码 `0`。
   - **报告输出共享面（`@req:r76`）**：所有报告型子命令必须复用共享注册的 `--output <toon|json|compact-json|human>`、`--json`、`--compact-json`（缺省 TOON）。
   - **全局根发现（`@req:r109`）**：全部子命令均支持 `--directory <path>`，复用统一实例根发现算子，不依赖 `process.chdir`。

---

## 2. 架构原则（已拍板）：CLI-First + Skill 主导，MCP 做超薄壳

经对比 Token 效率、零配置成本、多 worktree 兼容性与有状态能力边界，确立分工：
- **`packages/core` 为唯一大脑**，`.llmanspec-studio/sessions/<id>.json` 为跨进程共享草稿（Studio Web 经 `fs.watch` 实时刷新）；
- **CLI + Skill 作为一等主通道**：覆盖 100% 无状态/文件驱动的读、校验与写回协商动作，缺省 TOON 极省 Token、零配置兼容全部主流终端 Agent 且天然对齐多 worktree；
- **`llman-sdd studio mcp` 作为超薄包装壳**（零重复逻辑）：服务无 Shell 终端客户端，并专攻未来服务端主动推送、订阅唤醒、长时审批挂起等**真正有状态**的交互。

## 3. 命令树总览（MVP 必选 + 远期扩展槽位）

```text
llman-sdd studio [options]                      # [MVP] 默认 action：启动本地 Studio Web 工作台
  --port <n>                                    # 监听端口（默认 4710）
  --host <addr>                                 # 绑定地址（默认 127.0.0.1，仅本地回环）
  --no-open                                     # 启动但不自动打开浏览器
  --demo                                        # 以内置状态机样例启动（只读/沙盒体验，适合 0 状态表仓库）
  --directory <path>                            # 显式指定实例根查找起点

# === MVP 核心 CLI 协商面（CLI-First，配合 Skill 即可跑通完整双向协商）===

llman-sdd studio diff [session-id]              # 只读报告：输出草稿语义 Diff、评论与校验摘要
  --output <toon|json|compact-json|human>       # 复用 CLI 共享报告旗标（缺省 TOON，极致省 Token）
  --json / --compact-json
  --directory <path>

llman-sdd studio validate [session-id]          # 对草稿（或 --patch - 传入的假设补丁）执行 E1–E4 校验
  --patch <path|->                              # 可选：从文件或 stdin 预检假设修订，不改草稿
  --output <toon|json|compact-json|human>
  --directory <path>

llman-sdd studio prompt [session-id]            # 输出面向 Agent 的高信噪比结构化 Prompt 到 stdout
  --copy                                        # 可选：写入系统剪贴板
  --directory <path>

llman-sdd studio comment reply <session-id> <comment-id> --body <text>
                                                # Agent 写回评论回复，Studio 网页实时显示
  --directory <path>

llman-sdd studio revise <session-id>            # 从 stdin（或 --file）读取 JSON 修订建议并写入建议层
  --file <path>                                 # 避免命令行引号转义，Studio 网页以虚线红绿层呈现待人类采纳
  --directory <path>

llman-sdd studio sessions <list|prune>          # 查看或清理 .llmanspec-studio/ 下的本地暂存草稿
  --output <toon|json|compact-json|human>
  --directory <path>

# === MVP 超薄 MCP 包装壳（复用同一份 core，预留有状态能力）===

llman-sdd studio mcp [options]                  # 启动 MCP Server（MVP 默认 stdio；stdout 严禁混入日志）
  --transport <stdio|http>                      # 预留 Streamable HTTP 与服务端推送/订阅
  --print-config [client]                       # 打印可直接复制的 MCP 客户端配置片段并退出（退出码 0）
  --directory <path>

# ---------------- 远期预留槽位（不在 MVP 实现，仅防命名冲突） ----------------

llman-sdd studio export <format> [machine]      # [v0.2+] 导出到形式化工具或外部图格式
                                                #   format: alloy | tla | quint | mermaid | excalidraw
llman-sdd studio search <query>                 # [v0.3+] 本地语义检索（EmbeddingGemma / GraphRAG 召回）
```

---

## 4. 关键设计细节与取舍

### 4.1 为什么 `llman-sdd studio` 保留默认 action，而不是纯父分组？
- `cli.feature` 中 `change`/`spec`/`project`/`self` 是纯父分组（裸调报用法错退出 2），而 `config` 保留了默认 action（裸调即最常用动作）。
- `studio` 的 90% 人类高频动作就是“打开可视化界面”（类比 `prisma studio`、`storybook`），因此 **`llman-sdd studio` 裸调直接启本地 Web 服务**体验最顺滑；同时下面挂 `mcp` / `diff` / `prompt` / `sessions` 子命令供自动化与 Agent 协作。
- *待确认点*：若你更偏好严格一致（`studio serve` 显式启动、`studio` 裸调报错或等同 `--help`），在深挖阶段可以一键切换。

### 4.2 本地暂存目录与 Git 干净树门禁兼容
- **统一命名空间**：所有本地暂存草稿、节点坐标 sidecar、运行中端口发现文件统一放在 **`.llmanspec-studio/`**（绝不用裸 `llman` 前缀，避免与兄弟项目冲突）。
- **默认忽略**：`.llmanspec-studio/` 应进入 `.gitignore`（并在 `llman-sdd init` 指引中说明），确保人类在 Studio 里反复拖节点、改草稿、与 Agent 经 MCP 协商时，**绝不弄脏 Git 工作区，也不卡住 `llman-sdd change start` 的 `clean-tree` 门禁**。
- **唯一合法的仓库写入出口**：只有当人类明确点击「保存为 Change」时，才通过 `packages/core` 逻辑在 `llmanspec/changes/<id>/` 下生成合法草案。

### 4.3 `llman-sdd studio mcp` 的 stdout 洁净纪律
- 在 `stdio` 模式下，**`stdout` 是神圣的 JSON-RPC 协议通道**，任何进度日志、警告（包括 `loadCliConfig` 的 legacy WARNING）都必须严格走 `stderr`，绝不能污染 `stdout`——这与本仓 `llmanspec/AGENTS.md` “进度提示走 stderr”的纪律天然一致。
- `--print-config [client]`（例如 `claude-code` / `cursor` / `codex` / `generic`）向 `stdout` 输出现成 JSON/TOML 片段，解决用户配 MCP 时的“最后 1 公里”阻力。

### 4.4 `--demo` 模式与本仓样例设计
- 既然本仓当前 `llmanspec/specs/` 只有决策表、没有 `@transitions` 事件状态机，MVP 阶段准备 2 套精炼内置样例（既可用于 `--demo`，也可作为单元测试/演示夹具）：
  1. **报销审批状态机**（带守卫、驳回回环、多终态——展示分支/回环/守卫编辑与 E1–E4 拦截）；
  2. **任务执行/并发重试状态机**（带超时重试自环、取消终态——展示自环、平行边与未来对接 TLA+/Quint 的潜力）。
- 等后续仓库中出现真实 `@transitions` 规格表时，Studio 自动优先读取真实 `llmanspec/specs/`。
