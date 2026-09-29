# design：spec next-req-id 取号语义

## 方案取舍（issue #5 列举的四条候选）

1. **max+1（选定）**：与 `change next-id` 语义对齐；实现上只翻转 `nextReqId` 一处函数；空缺号段永不复用。代价：删除大量条款后编号不再致密（号段跳跃）——req id 没有密度契约，跳跃无实际成本。
2. tombstone 烧号：维持 smallest free + 维护退役号集合（持久化 tombstone 或扫描 archive）。需要新增持久化状态与出错面，复杂度显著更高；否决。
3. `--mode` 选项：保留两种语义供选。双语义长期共存正是本次要消除的困惑源；否决。
4. 低位号告警：不改语义只加告警。取号者多为自动化流程（propose 撰写引导），告警不构成约束；否决。

## 与前代 parity 的 divergent 记录

`nextReqId` 的实现注释原引用前代 `req_registry.rs::next_req_id_from_index`（smallest free）作为语义依据。本变更**有意 divergent**：前代语义在 archive 引用完整性上有缺陷（issue #5 实测复现），divergence 理由记录于本文件与实现注释，后续对照前代对拍时以此为准。

## 语义精确定义

- 输入：全局 rN 注册表 = 树内 specs（`llmanspec/specs/**`）`规则:` 块头的 `@req:rN` 句柄集合（与现状同源，`buildReqRegistry`；step 文本中的 `@req` 不计入）。
- 输出：`r(max(已用号) + 1)`；注册表为空时输出 `r1`。
- `spec skeleton` 共用同一函数，骨架取号随之对齐，无需单独处理。

## 与子项目提案（issue #6）的前向关系

issue #6（子项目 llmanspec 发现与验证）若落地，req id 命名空间的唯一性范围需另行决策（每子项目独立 vs 全仓唯一）。本变更把取号语义锚定在「全局 rN 注册表」上——注册表的扫描根是唯一需要随 #6 重新定义的参数，max+1 语义本身不变，避免未来返工。

## 实施顺序约束

BDD runner 对未匹配步骤直接抛错（`tests/bdd/runner.ts` `No step definition for`），且 `validate --strict` 会执行 `specs.check_command`（`bun test tests/bdd`）。因此 propose 阶段只改 r22 规则 prose（条款文本不绑定步骤、不被执行），既有场景文本与绑定保持字节一致（其断言值 r2/r3 在两种语义下同真）；场景文案改写与空缺回归场景连同 step 绑定在 apply 阶段（t2）同步落地。
