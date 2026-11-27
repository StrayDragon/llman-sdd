# Design: 跨语言 Runtime Trace 漂移对账与反向建议 Diff 闭环

本设计锁定 `add-studio-drift-trace`（C6）的 0-Token 跨语言对账协议、`@llmanspec:` 锚点最小切片提取、`llman-sdd studio drift` 命令、Studio 反向红绿裁决交互及 `llman-sdd-studio-drift` skill。全流程保持 **100% 离线确定性、零内置 LLM API/Key、零静默改写 `llmanspec/specs/`**。

---

## D1 跨语言 JSONL Runtime Trace 对账引擎（`packages/core/src/studio/drift.ts`）

- **语言无关 JSONL 协议**（任意语言测试/开发模式下 ~10 行胶水即可接入）：
  ```json
  {"machine":"order/r12/订单审批流转","from":"待审批","event":"超额转审","guard":"","to":"财务复核"}
  ```
  - 解析器逐行用 `zod` 校验，遇到损坏 JSON 或缺必填字段时明确报告行号与错误原因，不静默跳过；
  - `machine` 支持完整 `machineKey` 或无歧义唯一短名匹配。
- **纯域确定性对账 `reconcileRuntimeTrace(machines, events)`（0 Token）**：
  - **`shadowTransitions[]`**：真实运行中观测到、但 `llmanspec/specs/` 状态机未声明的 `(from, event, guard?, to)`，附出现次数与样例行号（抓静默后门边与紧急热修）；
  - **`uncoveredTransitions[]`**：规格中声明、但在整份 Trace 中从未被真实执行过的转移边（抓纸面死规格或测试漏测）；
  - **`unknownMachines[]`**：Trace 中出现但 `llmanspec/specs/` 完全找不到对应定义的状态机标识。

---

## D2 `@llmanspec:` 语义注释锚点与最小切片裁决包（0 Token）

- **跨语言统一锚点语法**（严格使用 `@llmanspec:` 前缀，避开兄弟项目裸 `llman` 前缀）：
  - 规则锚点：`@llmanspec:<reqId>`（如 `// @llmanspec:r34`、`# @llmanspec:r34`、`/* @llmanspec:r34 */`）；
  - 状态机锚点：`@llmanspec:machine:<machineKey>`。
- **纯域波及计算 `buildDriftSlicePacket(diffFiles, specEntries)`（0 Token）**：
  - 扫描改动源码文件中带 `@llmanspec:` 注释的代码范围，与 `git diff` 改动 hunk 求交集；
  - 仅打包「受影响的几十行 git hunk + 锚点反查到的那 1–2 条规则/状态机原文」，组成极小、高信噪比的 `DriftSlicePacket`；
  - 彻底避免无锚点自由扫描导致的“产物模糊发散”问题，也不在 CLI 中内置任何外部大模型调用。

---

## D3 CLI 入口 `llman-sdd studio drift`

挂载于 `apps/cli/src/commands/studio.ts`：

```text
llman-sdd studio drift [options]
  --trace <path>          读取跨语言 JSONL Runtime Trace 文件做 0-Token 状态机对账
  --since <git-ref>       对比相对 <git-ref> 的代码改动，按 @llmanspec: 锚点输出最小切片裁决包
  --write-state           将检出的 shadowTransitions 封装为反向建议层写入 .llman-sdd/studio/states/
  --fail-on-shadow        存在未登记后门转移时返回退出码 1（便于 CI 门禁拦截）
  --json / --compact-json 机器消费标准 JSON 输出（无新 TOON 耦合）
  --directory <path>      统一实例根解析
```

- **绝不静默覆盖真理**：`--write-state` 仅在 `.llman-sdd/studio/states/<id>.json` 中写入一条带 `source: 'drift-trace'` 标记的 `StudioRevisionProposal`（复用 C1/C2 原子存储），不修改 `llmanspec/specs/` 任何一个字节。
- **退出码契约**：`--fail-on-shadow` 仅针对 `--trace` 检出非空 `shadowTransitions` 时返回退出码 `1`；纯 `--since` 最小切片包生成模式（未传 `--trace`）退出码始终为 `0`，防止 CI 误拦截合法内部重构。

---

## D4 Studio Web 逻辑漂移校准与反向红绿对账裁决

- 统一使用正式产品术语 **「逻辑漂移校准」**（严禁在界面与文档中出现口语化表述，生产包严禁合入任何 `[DEMO-SIM]` 模拟触发器）；
- **遵循 Studio Web 5 条设计真言**：当 Studio Web（C3）通过 SSE 监听到带 `source: 'drift-trace'` 的建议层时，在**右侧世界线抽屉（`actor: 'agent'` 分叉节点）**中记录漂移提案，并遵循**顶栏浮层单槽互斥**提示：*「代码运行中观测到 N 条未登记状态转移，请团队裁决」*；
- **1:1 真实可交互画布叠加**：直接在左侧主画布叠加绿色虚线边与新状态（支持完整缩放、平移、右键留评论与就地讨论，不另开只读小图弹窗），点击「与当前对比」列出每条转移的 Trace 命中证据；
- 人类（产品/研发）显式二选一：
  1. **真理胜出（修代码）**：点击「真理胜出」打开**可视化「生成调整 Prompt」预编辑大窗**（零盲复制，附 Trace 证据与精确对象锚点，允许补充上下文后确认复制），让 Agent 删掉违规代码直到 `--fail-on-shadow` 变绿；
  2. **追认新意图（补录 Change）**：点击「追认新意图」（自动记入世界线多叉树与防抖自动保存）→ 自动跑对应图方言 Linter 体检 → 点底栏 **「保存变更」** 走绑定分支 `studio apply`（或默认分支写保护三出口向导）与测试补齐，重新对齐 SSOT。

---

## D5 配套 Skill：`llman-sdd-studio-drift`

- 在 `packages/core/templates/` 新增 `llman-sdd-studio-drift` skill，引导用户习惯使用的任意编码 Agent（Claude Code / Cursor / Codex / Antigravity）按既定 **4 类直改代码分流法则** 消费 `studio drift` 产出的最小切片包：
  1. 纯内部重构（放行，不动 `llmanspec/`）；
  2. 合规修复但 Spec 不够细（经 `studio comment reply` / `studio revise` 提轻建议给人类决定是否收编）；
  3. 破坏既有真理（立即修代码，不动 `specs/`）；
  4. 业务意图真变了（用 `--write-state` 推送反向红绿建议 Diff 到 Studio 交人类团队追认）。
- 实施期同步执行 `init --update` 刷新 `.agents/skills/` 并更新 `tests/golden/` 基线。

---

## 测试边界（Seam）

C6 的验收 seam 覆盖纯域、CLI 子进程与 Studio 反向裁决三层：
1. **纯域 Seam（`tests/unit/studio/drift.test.ts`）**：验证 JSONL Trace 对账（Shadow / Uncovered / 坏行报错）、TS/Rust/Python 注释中的 `@llmanspec:` 锚点扫描与最小切片构建、以及 Shadow → `StudioRevisionProposal (source: 'drift-trace')` 转换；
2. **CLI 子进程 Seam**：临时仓库跑真实 `llman-sdd studio drift --trace ... --since ... --write-state --fail-on-shadow`，验证退出码、`llmanspec/specs/` 零改写与 `.llman-sdd/studio/states/` 原子落盘；
3. **Web 渲染、增量规格与 Skill Golden Seam**：开工前补齐 `changes/add-studio-drift-trace/specs/` 增量行为规格；Studio 服务端与前端单测覆盖 `source: 'drift-trace'` 反向建议展示、就近通知卡与「真理胜出（零盲复制 Prompt）/ 追认新意图（方言 Linter + 保存变更）」闭环，验证 `llman-sdd-studio-drift` 渲染对齐 `tests/golden/` 及全仓 `just qa` 全绿。
