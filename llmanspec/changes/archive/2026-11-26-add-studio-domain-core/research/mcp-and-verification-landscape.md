# MCP 协商架构与形式化真理演进调研框架

> 性质：MVP 设计前置调研笔记（草案），用于界定 `llman-sdd studio mcp` 拓扑、形式化验证阶梯与真理写保护边界。标注「待核查」的条目将在下一轮深挖中查证一手文档后补齐。

---

## 1. 为什么 MVP 就必须把 `llman-sdd studio mcp` 想清楚

如果 Studio 只输出一段静态 Prompt 让用户复制给 Agent，交互是**单向开环**的：
- Agent 无法在修改代码前向 Studio 反查当前完整草稿、语义 Diff 与全部锚定评论；
- Agent 发现设计漏洞（如缺少某个异常分支或现有架构不支持某守卫）时，只能在聊天框里用大段自然语言描述，人类还得手动回到画布对照改图。

引入 `llman-sdd studio mcp` 后，形成**人类主导的双向协商闭环**：
1. 人类在画布改图、挂评论 → 复制简短 Prompt（携带草稿会话标识）发给任意支持 MCP 的 Agent 工具；
2. Agent 通过 MCP 工具直接读取结构化基线、红绿语义 Diff 与评论线程；
3. Agent 结合仓库真实代码做可行性核验，调用校验工具并经 MCP **回复评论**或**提交结构化修订建议（Revision Proposal）**；
4. 人类在 Studio 画布上直观看到 Agent 的建议 Diff（红绿区分），确认采纳或微调，最终由人类点击「保存为 Change」落盘。

---

## 2. Studio Web 与 MCP 的进程/状态同步拓扑（待深挖选型）

MVP 必须解决“浏览器里的 Studio 页面”与“外部 Agent 拉起的 MCP Server”如何共享同一份草稿会话并实时刷新。候选拓扑如下：

| 拓扑方案 | 架构方式 | 优点 | 风险 / 代价 |
| --- | --- | --- | --- |
| **方案 A：本地 Studio 守护进程 + 轻量 stdio MCP 桥接（推荐候选）** | `llman-sdd studio` 启动本地 HTTP/SSE 服务（持有草稿状态、调用 `packages/core` 校验、向浏览器推送变更）；`llman-sdd studio mcp` 以标准 stdio 启动（兼容绝大多数 MCP 客户端），通过本地端口/发现文件与 Studio 服务通信（Studio 未开时降级读写本地草稿文件）。 | 完美兼容 Claude Code / Cursor / Codex 等 stdio MCP 客户端；Agent 调 MCP 后，浏览器画布经 SSE/WS 秒级红绿刷新；离线也能读草稿。 | 需要一份干净的本地会话存储格式与服务发现文件（端口/token 仅绑 `127.0.0.1`）。 |
| **方案 B：Studio 内嵌 Streamable HTTP MCP 端点** | `llman-sdd studio` 同时暴露 Web UI 与 `/mcp` HTTP 端点，无需额外桥接进程。 | 单进程零桥接，状态天然共享。 | 部分 Agent 工具对本地 stdio MCP 支持最成熟，Streamable HTTP 配置门槛与兼容性需实测验证。 |
| **方案 C：纯文件系统共享（无常驻通信）** | Studio 与 MCP 都读写 `.llman-studio/sessions/<id>.json`，靠 `fs.watch` 互相感知。 | 实现最简单，不依赖端口发现。 | 并发写入锁、原子替换与跨平台 `fs.watch` 抖动需要小心处理。 |

> **待核查（下一轮调研）**：
> - `@modelcontextprotocol/sdk` 在 Bun + Node `>= 24`（仅使用 `node:` / Web 标准 API，符合 `llmanspec/AGENTS.md` 技术栈约束）下的体积、类型与 stdio / Streamable HTTP 兼容性。
> - 主流 Agent 工具（Claude Code / Cursor / Codex / Antigravity）对本地项目级 MCP 配置的发现机制。

---

## 3. 语义 Diff 与图元锚定模型（核心纯域设计）

为了同时服务 Studio UI、Prompt 导出、MCP 工具与未来多图适配器，核心模型应沉淀在 `packages/core`（保持纯域、无 I/O）：

- **稳定语义标识（Semantic Anchor）**：
  - 状态机锚点：`<capability>/<reqId>/<scenarioName>`
  - 状态锚点：`state:<stateId>`（为未来嵌套状态预留点分路径，如 `state:parent.child`）
  - 转移锚点：`edge:<from>:<event>[<guard>]-><to>`
- **结构化语义 Diff（不含坐标）**：
  - `states`: `added[]` / `removed[]` / `renamed[]`
  - `transitions`: `added[]` / `removed[]` / `modified[]`（标注具体变动字段：`event` / `guard` / `target`）
  - 坐标变更仅存 layout sidecar，**严格不进入 Diff**。
- **评论与 Agent 修订建议**：
  - 评论绑定 `anchor`，支持 `open` / `resolved` 与 `human` / `agent` 作者角色；
  - Agent 经 MCP 提交的 `RevisionProposal` 不直接覆盖人类草稿，而是作为独立建议层等待人类在画布上逐条或整体采纳。

---

## 4. 形式化验证与「业务真理写保护」演进路线

围绕“人类守护业务真理、不关心具体实现代码、防止 Agent 擅自篡改真理”的长期愿景，建议分三阶落地，避免 MVP 阶段被重型工具链阻塞：

| 阶段 | 形式化校验能力 | 业务真理写保护策略 |
| --- | --- | --- |
| **L1（MVP 现成复用）** | 复用 `packages/core/src/validation/xstateTransitions.ts` 的 E1–E4（结构与占位符、确定性、可达性、死锁/陷阱），在 Studio 与 MCP 中实时执行。 | 流程层面强制约束：Studio 草稿不直写 `specs/`；导出 Prompt 与 MCP 契约显式声明边界；依赖 `llman-sdd` 既有分支门禁与 `review` 审视 `specs/` 变动。 |
| **L2（轻量业务不变量）** | 为状态机增加人类可读的声明式不变量（如“某终态不可出边”“到达状态 B 前必经状态 A”“敏感事件必须携带守卫”），在 TypeScript 纯域层基于状态图遍历即时验证并给出反例路径。 | 探索可选的真理写保护机制：例如由人类显式签发 `specs/` 变更、在本地启用只读保护或 git hook / CLI 策略拦截未经人类签章的 `specs/` 修改。 |
| **L3（外部形式化工具对接）** | 将同一份状态机 + 不变量模型编译导出为 **TLA+ / Quint**（待后续选型调研，对比 Quint 与 TLA+ 的工程友好度及 CI 集成成本），验证并发、时序活性与跨状态机组合性质。 | 结合外部只读/提权写边界（如文件权限策略或独立受保护工作区），让 Agent 在物理权限上只能读真理、改实现代码。 |

> **待核查（下一轮调研）**：
> - Quint（基于 TLA 语义、语法贴近现代语言且内置模拟器/Apalache 后端）vs 原生 TLA+ vs Lean 4 在“业务状态机形式化验证”中的建模成本、报错可读性与 CI 速度对比。
> - 多层级视图（老板/产品层 ↔ 架构层 ↔ 状态机层 ↔ 代码投影层）的实体映射方式，避免引入新的同步负担。
