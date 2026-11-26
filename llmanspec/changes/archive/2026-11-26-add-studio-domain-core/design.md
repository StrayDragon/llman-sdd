# Design: Studio 纯域图模型、语义 Diff 与本地草稿会话底座

本设计锁定 `add-studio-domain-core`（C1）在 `packages/core` 中的纯域边界、数据结构、算法与 I/O 端口契约。所有实现严守 `llmanspec/AGENTS.md` 纪律：**纯域逻辑零直接文件/进程 I/O，运行时仅用 `node:` / Web 标准 API，不新增 TOON 耦合**。

---

## D1 模块布局与既有 Core 复用

新增纯域子模块 `packages/core/src/studio/`，并在 `packages/core/src/index.ts` 统一 re-export：

| 模块 | 职责 |
| --- | --- |
| `packages/core/src/studio/model.ts` | `StudioMachineIR`、`MachineDraft`、`StudioStateDoc`、语义锚点与 `uid` 生成规则 |
| `packages/core/src/studio/extract.ts` | 从 `SpecEntry[]` 提取纳管状态机为 `StudioMachineIR`（复用 `xstateTransitions.ts` 发现与列映射，绝不重搓正则） |
| `packages/core/src/studio/validate.ts` | 直接对 `StudioMachineIR` 执行 E1–E4 全量诊断（返回结构化错误列表，不短路掩盖后续问题） |
| `packages/core/src/studio/diff.ts` | 基于 `uid` 的语义 Diff 引擎（忽略坐标、精准识别状态改名）与极简 `+ / - / ~` 人读摘要渲染 |
| `packages/core/src/studio/revisions.ts` | 图元锚定评论与 `StudioRevisionProposal` 建议层的纯函数应用与状态流转 |
| `packages/core/src/studio/featureSync.ts` | 无损渲染更新后的 `.feature` 源码、生成合规 `proposal.md`，以及基于 `diff`（`jsdiff >= 8.0.3`）的内存 Unified Diff 实时预览 |
| `packages/core/src/studio/store.ts` | `.llman-sdd/studio/states/<id>.json` 纯域序列化、校验与注入式 `StudioStateIo` 端口 |
| `packages/core/src/studio/demos.ts` | 2 套内置演示样例状态机（供 0 状态表仓库 `--demo` 与单测复用） |

对现有 `packages/core/src/validation/xstateTransitions.ts` 仅做最小增量：导出已有的 `extractTransitions` 与 `resolveTransitionColumns` / `resolveTransitionDecision`，**不改变现有 CLI 校验的退出码、短路序与任何 ERROR 文案**。

---

## D2 状态机图 IR 与双来源模式（`modify` / `create`）

每张状态机以稳定键 `machineKey = "<capability>/<reqId>/<scenarioName>"` 索引（新建草稿无既有 `reqId` 时以 `<capability>/new/<scenarioName>` 占位，导出 patch 时生成占位 `@req:TODO` 或按 `nextReqId` 分配）：

```ts
export interface StudioStateNode {
  /** 草稿内稳定唯一标识，用于改名追踪与边绑定 */
  uid: string;
  /** 业务状态名（写入 .feature 的值） */
  name: string;
}

export interface StudioTransitionEdge {
  uid: string;
  fromUid: string;
  event: string;
  guard?: string;
  toUid: string;
}

export interface StudioMachineIR {
  machineKey: string;
  capability: string;
  reqId: string | null;
  ruleTitle: string;
  scenarioName: string;
  /** 初始状态 uid（对应例子表首行 from；可显式指定） */
  initialStateUid: string | null;
  /** 原例子表列名族（保留英文或中文表头风格） */
  columns: { from: string; event: string; to: string; guard?: string };
  states: StudioStateNode[];
  transitions: StudioTransitionEdge[];
}

export interface MachineDraft {
  /** modify=修改已有业务，create=从0新建业务，remove=标记下线/移除业务线 */
  mode: 'modify' | 'create' | 'remove';
  /** mode=create 时为 null；mode=modify/remove 时保存从 specs 提取时的基线快照 */
  baseline: StudioMachineIR | null;
  /** 当前人类正在编辑的暂存状态机（mode=remove 时为 null，语义 Diff 呈现全图红删） */
  current: StudioMachineIR | null;
  /** 关联的 .feature 相对路径（如 llmanspec/specs/order.feature） */
  sourceFile: string;
}
```

- **冷热拆表**：节点 `(x, y)` 坐标**绝不进入** `StudioMachineIR`，独立存在 `StudioStateDoc.layouts[machineKey][stateUid]` 中。
- **0 → 1 新建（`mode: 'create'`）**：`baseline` 为 `null`，语义 Diff 中所有状态与边均标记为 `added`（画布全绿），导出 `specs.patch` 时若目标 `.feature` 不存在则生成 `--- /dev/null` 新建补丁，若目标 `.feature` 已存在则生成在文件末尾追加 `规则:` + `@transitions` 场景大纲的补丁。

---

## D3 语义 Diff 引擎（忽略坐标、精准识别状态改名）

`computeMachineDiff(draft: MachineDraft): MachineSemanticDiff` 的核心不变量：

1. **只比 `baseline` 与 `current`，绝不读取 `layouts`** —— 拖排节点 100 次，Diff 始终为空。
2. **状态比对（按 `uid` 匹配）**：
   - `uid` 仅在 `current` → `state_added`
   - `uid` 仅在 `baseline` → `state_removed`
   - `uid` 两者皆有且 `baseline.name !== current.name` → `state_renamed { uid, from, to }`
3. **转移比对（按 `uid` 匹配，同时用解析后的 `uid` 比较端点）**：
   - 因状态改名导致的端点显示名变化**不重复报为边删增**，只由 `state_renamed` 表达一次；
   - 同一边 `uid` 的 `fromUid` / `toUid` / `event` / `guard` 任一变化 → `transition_modified`（精确列出 `changedFields: Array<'from' | 'event' | 'guard' | 'to'>`）；
   - 新增/删除边 → `transition_added` / `transition_removed`。
4. **极简人读摘要（`formatSemanticDiff`）**：直接输出无冗余的 `+ / - / ~` 文本块，供 `proposal.md` 与 Prompt 使用：
   ```diff
   ~ 状态改名: draft -> pending
   ~ pending --[bind_branch]--> full   (guard: "" -> "clean_worktree")
   + pending --[reject]--> rejected
   ```

---

## D4 可扩展 Linter 全量图校验（面向交互诊断）

现有 `validateTransitionScenario` 面向 CLI 门禁会在首个错误处短路返回。C1 新增纯函数 `validateMachineGraph(machine: StudioMachineIR): MachineDiagnostic[]`（可扩展规则模型，每条诊断带 `code`、`severity: 'error' | 'warning'`、`targetKind`/`targetId` 与可选 `fixable` 标记），在阻断门禁层复用完全等价的 E1–E4 数学判据，并支持向上扩展 Warning 规则（如 `W1` 守卫缺兜底、`W2` 草稿占位名），避免前端写死固定 4 格：

- `E1`（error）：状态数 `< 2`、存在空状态名/空事件名、无转移行 → 定位到对应 `stateUid` / `edgeUid` 或整机；
- `E2`（error，`fixable: 'delete-edge'`）：重复 `(fromUid, event, guard)` → 定位到冲突的全部 `edgeUid[]`；
- `E3`（error）：从 `initialStateUid` 经 `genBFS` 不可达的状态 → 定位到每个孤岛 `stateUid`；
- `E4`（error）：有终态（出度为 0）时无法 `hasPath` 到任一终态的死锁节点，或无终态时无法回到 `initialStateUid` 的陷阱节点 → 定位到每个问题 `stateUid`；
- `W1` / `W2`（warning，非阻断）：单一守卫出边缺兜底分支、临时占位状态名提示，供 Studio Linter 面板按 `全部 / 错误 / 警告` 分级展示。

---

## D5 锚定评论与 Agent 修订建议层

```ts
export type SemanticAnchor =
  | { kind: 'machine'; machineKey: string }
  | { kind: 'state'; machineKey: string; stateUid: string }
  | { kind: 'edge'; machineKey: string; edgeUid: string };

export interface StudioComment {
  id: string;
  anchor: SemanticAnchor;
  author: 'human' | 'agent';
  body: string;
  createdAt: string;
  status: 'open' | 'resolved';
  replyTo?: string;
}

export type RevisionOp =
  | { op: 'add_state'; name: string }
  | { op: 'remove_state'; stateName: string }
  | { op: 'rename_state'; from: string; to: string }
  | { op: 'add_transition'; from: string; event: string; guard?: string; to: string }
  | { op: 'remove_transition'; from: string; event: string; guard?: string; to: string }
  | {
      op: 'update_transition';
      match: { from: string; event: string; guard?: string; to: string };
      next: { from?: string; event?: string; guard?: string; to?: string };
    };

export interface StudioRevisionProposal {
  id: string;
  machineKey: string;
  author: 'agent';
  rationale: string;
  ops: RevisionOp[];
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected';
}
```

- **不覆盖人类草稿原则**：Agent 经 CLI/MCP 提交 `StudioRevisionProposal` 时只追加到 `revisions[]`（`status: 'pending'`）；纯函数 `previewRevisionProposal(draft, proposal)` 计算“采纳后的预演 Diff”，人类显式采纳后由 `acceptRevisionProposal(stateDoc, revisionId)` 原子应用到 `current` 并将状态置为 `accepted`。
- **跨进程改名显式表达**：外部 Agent 不必记住内部 `uid`，通过 `rename_state { from, to }` 即可无歧义匹配到对应 `stateUid` 并保留全部相连边的 `uid`。

---

## D6 本地暂存目录、Git 式变更时间线与原子写盘契约

- **路径规范**：`<instanceRoot>/.llman-sdd/studio/states/<stateId>.json`（由 `.gitignore` 忽略，绝不污染 Git 工作区与 `change start` 的 `clean-tree` 门禁）；复用 `packages/core/src/validation/roots.ts` 的 `discoverRoots()` / `resolveInstanceRoot()` 统一根公理，天然隔离多仓与 monorepo 子项目（如 `crates/xylitol-tui/llmanspec/`）的草稿。
- **Git 式线性变更时间线（MVP 统一撤销与观测）**：`StudioStateDoc` 内置线性快照时间线 `timeline: { entries: TimelineEntry[]; headIdx: number }`，根节点 `seq: 0` 钉死为不可变的**实际真理基准 `BASE`（`llmanspec/specs/`）**，每次语义编辑追加带时间戳、操作摘要与净改动计数的快照提交：
  - 统一取代零散 undo/redo 栈（撤销/重做即移动 `headIdx`）；
  - 支撑无损只读时间旅行观测与一键回滚（含一键还原至 `BASE`）；
  - MVP 阶段向 Agent 生成的单一 Prompt 始终按 **`实际 BASE → 当前 HEAD`** 计算净语义 Diff，自动折叠中间试错噪音。
- **状态 ID 规则**：`st-<yyyymmdd>-<4位短随机/递增>` 或合法 kebab-case 名称（禁止路径穿越字符）。
- **并发写安全**：`StudioStateIo` 接口要求实现方通过「写同目录 `.tmp.<pid>.<rand>` → 原子 `rename` 覆盖目标文件」保证 Web 服务与 CLI/MCP 并发写入时绝不出现半截损坏 JSON；纯域层通过 `zod` schema 校验读入内容并携带 `version: 1` 方便未来演进。

---

## D7 绑定分支直写 `.feature` 与内存 Unified Diff 实时预览（无游离 `specs.patch`）

为彻底避免多 worktree 并行开发时游离 patch 文件因前提 commit 过期而无法应用的瓶颈，**不生成持久化 `specs.patch` 文件**，直接对齐 `llman-sdd` 原生 Git 分支生命周期（`change start [--worktree]` → 绑定分支直写 specs → Git 原生 merge-base / `change diff` / 三方合并）：

1. **`buildProposalDraft(input)`（未绑定探索期 / 草案落盘）**：
   - 合法 frontmatter（仅 `depends_on: []` 与非空 `title`）；
   - `## Why`（人类填写的变更意图）；
   - `## What Changes`（按机器分组的极简语义 Diff 摘要 `+ / - / ~` + 已确认的关键评论结论）；
   - `## Capabilities`（自动汇总受影响的 capability 列表）与 `## Impact`（指引 `change start [--worktree]` 后在绑定分支落盘 specs）。
2. **`renderUpdatedFeatureSource(originalText, draft)`（绑定分支直写 `.feature`）**：
   - 对 `mode: 'modify'`：在绑定分支当前的 `.feature` 原文中精确定位目标场景大纲的 `例子:` 表格区间，仅按列宽对齐替换该例子表行（保留其余全部注释、规则正文、缩进与尾换行）；若目标场景已不存在则返回清晰域错误；
   - 对 `mode: 'create'`：若目标能力文件已存在，在文件末尾追加规范格式的 `规则:` + `@transitions` 场景大纲；若目标文件不存在（`originalText === null`），生成含 `# language: zh-CN`、`# purpose:`、`功能:` 与 `@transitions` 场景大纲的完整 `.feature` 文本；
   - 对 `mode: 'remove'`：定位并移除对应状态流转场景大纲（若该规则块下已无其他场景则标注/移除整条规则块），支撑业务线下线闭环。
3. **`previewFeatureUnifiedDiff(filePath, beforeText, afterText)`（实时预览，不落盘）**：
   - 复用零运行时依赖的标准库 **`diff`（`jsdiff >= 8.0.3`，BSD-3-Clause，内置原生 TS 类型）** 的 `createTwoFilesPatch`，严格锁定 **`>= 8.0.3`** 免疫 **CVE-2026-24001**，在 Studio Web 与 CLI 中向人类和 Agent 实时展示行级 Unified Diff 预览，零自定义格式、零 TOON 耦合。

---

## D8 内置演示样例（`demos.ts`）

纯域内置 2 套开箱即用的状态机样例（无外部 I/O，零状态表仓库 `--demo` 模式与单测共用）：

1. **报销审批状态机（`demo/reimbursement`）**：`草稿 → 待审批 → 已通过 / 已驳回`，含金额守卫（`金额<=5000` / `老板审批`）与 `已驳回 → 待审批` 回环；
2. **任务执行与重试状态机（`demo/job-runner`）**：`queued → running → succeeded / failed / cancelled`，含 `running → running` 重试自环与 `retry_left>0` 守卫。

---

## 测试边界（Seam）

C1 全部逻辑位于 `packages/core/src/studio/` 纯域层，验收 seam 为 `packages/core` 公开导出的纯函数（在 `tests/unit/studio/` 下以 `bun test` 直接驱动）：
- 提取与往返：`parseCapability` → `extractStudioMachines` → `validateMachineGraph`（覆盖中英文列、守卫、自环、孤岛、死锁、重复冲突）；
- 语义 Diff：改名不炸假边、拖排坐标变更 Diff 为空、0→1 新建全绿；
- 修订建议与评论：锚定评论回复、Agent `rename_state` + `add_transition` 建议预演与采纳；
- `.feature` 无损写回与 Diff 预览往返：验证 `renderUpdatedFeatureSource`（覆盖 `modify` 保留注释/缩进、`create` 新增文件与追加规则、目标场景缺失报错）、`previewFeatureUnifiedDiff` 输出合法 Unified Diff，且写回后的 `.feature` 经 `parseCapability` + `validateCapability` 全绿。
