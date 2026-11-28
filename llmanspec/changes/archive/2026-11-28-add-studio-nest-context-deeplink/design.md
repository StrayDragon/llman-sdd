# 设计：嵌套下钻上下文与 DAG 深链

遵守人类定理：`studio-production-hygiene`（单色线框、无彩色 emoji、无占位/Demo 按钮）、`core-zero-io`（新纯函数无 I/O）。demo 原文已拷贝至 `research/studio-demo.html`。

## 本仓与 demo 逐项差异

| 项 | demo | 本仓现状 | 改法 |
| --- | --- | --- | --- |
| Q1 返回选中 | `jumpNestLevel(idx, focusStateUid)`（demo L4246–4260）选中宿主或邻居 | `studioStore.ts` `jumpNestLevel(idx)` 无 focus | 签名加可选 `focusStateUid`；返回时 `setFocusStateUid` 并居中（沿用 canvas L1144–1152） |
| Q2 嵌套门户 | `getParentNestContext` 投影父机入/出邻居（demo L4262–4294、L7532–7546） | `StateMachineCanvas.tsx` L1629–1700 只读 `macroEdges` | 嵌套时用 nestStack 求父机邻居门户；非嵌套保持 macroEdges；二者互斥不叠加 |
| Q3 边界标题 | 「展开内部：<宿主名>」+ `L${nestStack.length}`（demo L7615、L7587） | 边界框 `当前状态机边界 · {title}`（L515）；面包屑无 L | 嵌套时标题改为「展开内部:<宿主名>」；面包屑加 `L<n>` |
| Q4 就地预览 | `peekSubNodeIds` 切换，节点内子图缩略 + 脏标（demo L4296–4350、L7883–7940） | 复合节点仅 `onDive` 药丸 | store `peekSubNodeIds` 默认空；节点内只读缩略 SVG；子树脏则角标 |
| Q5 子树聚合 | `getSubtreeMachineIds` / `hasSubtreeChanges` / `buildSubtreeDiffText`（demo L3946–3985） | `buildNegotiationPrompt` 只扫传入 machineKey | 纯函数 selector；Prompt 对子树分层 `# [子层: …]` |
| Q6 深链 | hash `ws/tab/nest/focus`（demo L9374–9412） | `/p/:wsKey?kind=&target=` + `studio-focus-context`（`App.tsx` L42–64、server L1451–1488）；targetKind 无 forest/macro-edge 选中还原 | 查询串向后兼容加 `nest`、`focus`；JSON schema 可选字段；App 还原 nestStack 与选中 |
| Q7 DAG | 同一子机多宿主（demo L1956、L1975）；父层=nestStack 路径 | 无单一 parentMachineId，但门户不按路径求邻居 | 父层只由 nestStack + 当前 Tab 根机求解；分享 URL 写入 nest |
| Q8 洁癖 | 单色线框 | 已有 e2e copy-hygiene | 不引入彩色 emoji / 占位文案 |

既有、不重做：`nestStack` / `diveSubMachine` / `jumpNestLevel` / `navHistory`、Alt+↑（`App.tsx` L199）、盒中盒、面包屑条（`StateMachineCanvas.tsx` L2342）。

## nest 路径编码（URL / JSON / markdown）

内存 `nestStack` **保持既有语义**：只含已下钻的子机（空 = 正在看 Tab 根机）。不把根机塞进 stack，以免打坏已持久化的 `navHistory`。

三处编码统一为**含根机的机器 key 列表**（深度 = 列表长度）：

| 处 | 形态 | 例（3 层） |
| --- | --- | --- |
| URL query | `nest=<k0>,<k1>,<k2>`（逗号分隔，首项=Tab 根机） | `?kind=machine&target=<k0>&nest=k0,k1,k2` |
| JSON | `studioFocusContext.nest: string[]`（可选，缺省等同无下钻） | `"nest": ["k0","k1","k2"]` |
| markdown | 一行 `- Nest: \`k0 > k1 > k2\`` | 无 nest 时省略该行 |

`focus`：`forest|<id>`、`macro-edge|<id>`、`state:<id>`、`edge:<id>`。查询参数 `focus=macro-edge:<id>`（与 demo 一致）。JSON 可选 `focus: { kind, id }`。既有 `kind`/`target`/`targetKind`/`targetId` **保持**：无 nest/focus 时行为与现在相同（C5）。

canonical URL 生成：在现有 `?kind=&target=` 后按需追加 `&nest=` `&focus=`。hash 形态 `#nest=...&focus=...` 仅浏览器侧解析，与 query 同义（C2）。

`targetKind` 枚举保持 `macro|machine|doc|state|edge`；`macro-edge` / `forest` 走新增 `focus` 字段，避免破坏既有 zod 与 HTML 内嵌脚本。

## DAG 下 nestStack 与「父层」求解

同一 `subMachineKey` 可被多个宿主状态引用。禁止用全局 `parentMachineId`。

```
Tab 根机 R
nestStack = [A, B]          // 已下钻两层，当前机 = B
父机 P = nestStack.length === 1 ? R : nestStack[n-2].machineKey
当前机 C = nestStack[n-1].machineKey
宿主状态 = P.states 中 subMachineKey === C 的那个（路径上恰好一个；找不到则无父层门户）
入邻居 = P 中 to === 宿主 且 from !== 宿主 的边之源状态
出邻居 = P 中 from === 宿主 且 to !== 宿主 的边之目标状态
标签 = event + 可选 [guard]
```

返回上层：`jumpNestLevel(nestStack.length - 2, hostUid | neighborUid)`。点面包屑第 i 项：`jumpNestLevel(i)`（无 focus 则选中该层作为宿主的状态——若跳到非当前父层则不选邻居）。

L 标签：`L{nestStack.length + 1}`（含根机；3 层 URL → L3）。

## 子树聚合

`getSubtreeMachineIds(root, machines, visited)`：先序，`visited` 防环；环上已访问节点不再展开，函数返回（C1 不死循环）。

`hasSubtreeChanges`：子树任一机 `computeMachineDiff.hasChanges`。

`buildSubtreeDiffText`：根层无前缀；其余层 `# [子层: <machineKey>]` + `formatSemanticDiff`。Prompt 工作台对当前机调用该文本（不改 CLI `studio prompt`）。

## 门户互斥与避障

嵌套且父层上下文可解析 → 只用父层邻居门户（`is-parent-ctx`），点击 `jumpNestLevel(parentIdx, neighborUid)`。
否则 → 现有 macroEdges 门户。
不把两类门户同时放入同一帧。连线仍走 `obstacleRouter`。

## 范围外

- F9 规则→子规则→源码就地下钻
- UI 内设为子机 / 取消嵌套
- core 抽取写回与 N1–N5
- CLI 命令与旗标
