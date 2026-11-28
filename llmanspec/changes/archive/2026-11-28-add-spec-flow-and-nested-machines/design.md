# Design: 规格声明流程图方言与子机嵌套

遵守人类定理：`core-zero-io`（抽取 / 写回 / N1–N5 / 森林投影纯函数）、`cli-dual-runtime`（CLI 只渲染 `TRANSITIONS_INTROSPECTION`）、`studio-production-hygiene`（不静默覆写真实 `llmanspec/specs/`）。IR 不新增字段。锁定设计不得自行更改。

---

## D1 语法定稿

`@flow` 打在**转移**场景大纲上。`@states` 打在**同一规则内**另一份场景大纲上，作用于该规则里转移大纲抽出的状态。Gherkin `规则:` 不能嵌套，子机只能是规则 / 场景之间的引用。

### 中文列头

```gherkin
  @req:r10
  规则: 订单主流程
    订单 MUST 按状态机流转，审核步骤嵌套审批子机。

    @flow
    @transitions
    场景大纲: 订单主流程
      假如 当前处于 <初始状态>
      当 触发 <事件>
      那么 流转至 <目标状态>
      例子:
        | 初始状态 | 事件 | 目标状态 |
        | 待审核   | 提交 | 审核中   |
        | 审核中   | 通过 | 已完成   |

    @states
    场景大纲: 状态属性
      假如 状态 <状态>
      当 读取属性
      那么 子机为 <子机>
      例子:
        | 状态   | 子机            | 网关 |
        | 审核中 | @req:r20#审批流 | 是   |
```

### 英文列头

```gherkin
  @req:r10
  Rule: order main flow
    Orders MUST nest the review submachine inside the reviewing step.

    @flow
    @transitions
    Scenario Outline: order main flow
      Given current state is <from>
      When event <event> fires
      Then flow to <to>
      Examples:
        | from      | event | to        |
        | pending   | submit| reviewing |
        | reviewing | pass  | done      |

    @states
    Scenario Outline: state attributes
      Given state <state>
      When attributes are read
      Then submachine is <submachine>
      Examples:
        | state     | submachine              | gateway |
        | reviewing | @req:r20#review flow    | yes     |
```

列族：

| 角色 | 别名 | 必填 | 值 |
| --- | --- | --- | --- |
| state | `state` / `状态` | 是 | 宿主状态名，须存在于同规则转移表 |
| submachine | `submachine` / `子机` | 否 | `@req:<id>`（目标规则恰 1 台机器）或 `@req:<id>#<场景名>`（多台时消歧）；经全局 req 注册表，允许跨能力 |
| gateway | `gateway` / `网关` | 否 | 真值：`是` / `yes` / `true`（大小写不敏感）；其余为假 |

`@states` 步骤必须绑定 `<state>`（Given）；有 submachine 列时再绑定 `<submachine>`（Then）。语义对齐既有 E1 占位符绑定。

网关真值以外的单元格（空、`否`、`no`、`false`）一律视为非网关。既无子机也无网关的行在写回时删除。

---

## D2 发现与方言

`resolveTransitionDecision` 短路径：

1. 挂 `@states` → `skip`（永不进转移嗅探 / 强制纳入）
2. (`@flow` ∨ `@transitions`) ∧ `@no-transitions` → `conflict`（ERROR，规格与既有双标签冲突同形）
3. `@no-transitions` → `skip`
4. `@transitions` ∨ `@flow` → `force`；其中 `@flow` 另将 IR `graphKind` 置为 `'flow'`
5. 无 tag → 既有三族至少两族嗅探；`@states` 列族不会命中 from/event/to，故不会被嗅探为转移表

规格级 validate：

- 非 `@flow` 转移大纲：E1–E4 不变
- `@flow` 大纲：E1 / E2 / E3，**不施 E4**；抽出后对 IR 跑 `validateMachineGraph`，收集 F3（网关出边 < 2）与 F4（占位名）为 WARNING，语义与 `validateFlowchartGraph` 一致
- `@states` 大纲：结构 + 占位符绑定（Given `<state>`，有子机列则 Then `<submachine>`）
- N1–N5 为 ERROR，anchor 为 `${cap}/transitions/${req}`

规则级 `@flow`（森林夹具已有）**不**写入 `graphKind`；森林 `kind:'flow'` 仍保留规则 tag 回退，以免既有分类回归。

---

## D3 N1–N5 判定伪代码

```
catalog = extract transition machines from all SpecEntry[]
  (skip @states / skip / conflict; set graphKind if @flow)

links = []   # {hostCap, hostReq, hostMachineKey, hostState, targetKey, rowRef}

for each entry, rule:
  hosts = catalog machines whose (capability, reqId) match this rule
  rows  = union of all @states outlines in this rule
  seenHostStates = empty multiset

  for each row in rows:
    state = trim(row[state])
    ref   = parse `@req:<id>` or `@req:<id>#<scenario>` from submachine cell
    isGw  = gateway cell in {是, yes, true} (i18n)

    hostsWithState = hosts.filter(m => m.states has state)
    if hostsWithState.length == 0:            emit N3  # 宿主状态不存在
    if hostsWithState.length > 1:             emit N5  # 同规则多机同名歧义
    if seenHostStates.count(state) >= 1:      emit N4  # 同一宿主状态映射两次
    seenHostStates.add(state)

    if ref is empty: apply isGateway only; continue
    occs = global req registry[ref.id]
    if occs missing:                          emit N1  # req 不存在
    targets = catalog machines with reqId == ref.id
              (and scenarioName == ref.scenario if fragment present)
    if targets.length == 0:                   emit N1  # 目标规则无状态机
    if targets.length != 1:                   emit N1  # 无法唯一解析（缺 #场景名）
    else:
      apply subMachineKey = targets[0].machineKey  (extract path)
      links.append(host → target)

# N2 全局环（不设深度上限）
graph = directed edges from links
for each cycle found by DFS (path of machineKeys):
  emit N2 with cycle path joined by " -> "

# 抽取：只在引用唯一解析成功时写 subMachineKey / isGateway
# 校验：独立再走一遍 rows，不依赖抽取是否写上字段
```

多宿主共享同一子机合法。环只看 `subMachineKey` 有向边，与森林 spec-ref 证据边无关。

---

## D4 抽取、写回、Diff / 同步、森林、检索

**抽取**（`extractStudioMachines`）：第一遍抽转移机并打 `@flow`；第二遍用全局 catalog 解析同规则 `@states`，写入既有 `subMachineKey` / `isGateway`。不新增 IR 字段。`createMachineDraft` 接受可选 `graphKind` 与状态上的 `isGateway` / `subMachineKey`。

**写回**（`renderUpdatedFeatureSource`）：

1. `modify` 且 `computeMachineDiff` 无变化（含 graphKind / 嵌套 / 网关）→ **原样返回**原文（往返无损红线；不得重排无关空白）。
2. 转移表仍按语义定位替换；列宽格式化只在确有转移改动时发生。
3. `@states` 定位：同一规则内第一条带 `@states` 的场景大纲（tag 行到表尾）。
   - 状态改名：按 uid 对照 `statesRenamed` 改 state 单元格，保留未改动的子机原文（解析结果未变时）。
   - 嵌套 / 网关增删：增删对应行；序列化优先 `@req:<id>`，目标规则多机时用 `@req:<id>#<场景名>`。
   - 无剩余行 → 删除该大纲（含 tag 行），压缩多余空行。
   - 需要属性但无大纲 → 在规则内转移大纲之后插入一份（中文列头「状态属性」/ 英文「state attributes」）。
4. `@flow`：IR `graphKind==='flow'` 则确保转移大纲 tag 行含 `@flow`，否则移除该 tag；不得改动其它 tag。
5. `create`：若 IR 含 `graphKind:'flow'` / `subMachineKey` / `isGateway`，同时写出 `@flow` 与 `@states` 大纲。
6. 不得改动无关文本与缩进。

**Diff**：`computeMachineDiff` 增加 `nestLinksChanged`（stateUid + from/to machineKey）与 `gatewaysChanged`（stateUid + from/to bool），以及 `graphKindChanged`。`formatSemanticDiff` 输出：

```
+ nest: 审核中 -> child/r20/审批流
- nest: 审核中
~ nest: 审核中: oldKey -> newKey
+ gateway: 审核中
- gateway: 审核中
```

**同步**：`buildSyncItems` 语义签名增加 `(stateName, subMachineKey)` 与 `(stateName, isGateway)`。同签名两侧一致则不出条目；两侧都有且不同则无默认勾选，`applySyncPicks(..., both)` 仍 `blocked: signature-clash`。`RevisionOp` 不新增；`applyRevisionOpsToMachine` 经 `cloneMachineIR` 就地改名，保留 `subMachineKey` / `isGateway`。

**森林**：`ForestNode` 增加 `maxNestingDepth`、`nestedMachineCount`（直接子机去重计数；深度为 `subMachineKey` 链最长路径，环上视为 0 以免无穷）。**不**为嵌套添加 `spec-ref` 边。

**检索**：`buildWorkspaceSearchDocuments` 对规格抽出的机器索引状态名 / `subMachineKey` / `isGateway` / `graphKind`；若 `stateDoc` 已有同 `machineKey` 则以草稿为准，避免双份。

**`--demo`**：`extracted.length > 0 ? extracted : demoMode ? demos : []` 保持不变；不删 `demos.ts`。

---

## D5 被排除为决策表的判定点（grep 证据）

唯一谓词是 `isDecisionExamplesBlock`；所有消费方都经 `extractDecisionTables`：

| 位置 | 角色 |
| --- | --- |
| `packages/core/src/studio/decisionTree.ts:148` | `isDecisionExamplesBlock`（headers≥2 ∧ rows≥2 ∧ 非转移列 ∧ 非 `@transitions` force） |
| `packages/core/src/studio/decisionTree.ts:161` | `extractDecisionTables` 调用该谓词 |
| `packages/core/src/studio/forest.ts:263` | `decisionTableCount` 来源 |
| `packages/core/src/studio/search.ts:136` | 检索文档来源 |
| `apps/cli/src/studio-server/server.ts:363` | Hub 详情 `decisionTables` |
| `tests/unit/studio-web-core.test.ts` / `tests/bdd/steps/studio-web.ts` | 经同一函数，不另写判定 |

修复：`isDecisionExamplesBlock` 在现有条件前排除 `@states` 大纲，以及表头命中 state\|状态 列族且未命中完整 from/event/to 的块。转移嗅探侧对 `@states` 直接 `skip`。不存在第二套平行启发式。

---

## D6 自省 SSOT

`TRANSITIONS_INTROSPECTION`（`xstateTransitions.ts`）增加 `@flow` / `@states` 标签语义、state/submachine/gateway 列族、N1–N5 与「@flow 跳过 E4、附 F3/F4 WARNING」。CLI `spec transitions` 仍逐字段渲染，不另抄文案。
