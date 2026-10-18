---
depends_on: []
title: 数字标识符分发口径统一——全勘察范围 max+1 单一分配器与工作区内唯一性检验
needs_specs_change: true
branch: sdd/unify-numeric-id-allocation
base_branch: main
base_sha: 06ce4d7d8458584ac6f833e371bdca914cde68dc
---

## Why

本仓数字性质 id 的「下一个值」目前有两套可观测分叉的算法,且唯一性检验点散落:

1. **req id 取号**(`spec next-req-id`/`spec skeleton`):`nextReqId` 按全局注册表
   max+1 —— 已符合本决策。
2. **req id 冲突重映射**(`project dedupe-req-ids`):`planDedupe` 内的 `fresh()`
   按 smallest-free 线性探号 —— 实测 `{r1 冲突, r5 已用}` 场景发 r2 而非 r6,
   与 max+1 口径在对外输出上分叉。
3. **change 序号**(`change next-id` 与 `change_id.template` 的
   `llman_sdd_unique_id`):跨 worktree max+1 —— 已符合。
4. **唯一性判定**:`add-req` 有 `req id already in use` 检验;change id 有
   validate r87 判重;但「分发值 + 存在性检验」分属不同代码路径,没有单一的
   「分配器」概念,未来新增数字 id(或子项目多根,见下)时容易再分叉。

决策(用户定案,2026-10):**所有数字性质 id,CLI 分发与检验规则统一为——**

- 分发值 = CLI 全部勘察范围内已用数字的 **max + 1**(空集为 1);
- 检验规则 = **当前工作区(勘察根)内不重复**;
- `change_id.template` 的 `llman_sdd_unique_id` 变量与 `change next-id` 同源,
  同受此口径约束。

即:**一个分配器原语,处处 max+1;一个唯一性域,当前工作区勘察范围**。

## 与既有既定事实的关系

- `align-next-req-id-max-plus-one`(已归档)确立的 max+1 语义与 issue #5 的
  「退役号不复用」理由**全部继承**,本 change 只是把 dedupe 分支也拉齐到同
  一原语,不推翻其任何结论。
- 「max+1 vs smallest-free 是有意分叉、不得合并」的旧红线由本 change 显式
  **取代**:统一后红线改写为「数字 id 分发必须经单一分配器原语,不得在调用
  点重写探号循环」。

## 统一后的语义(目标条款草案)

- **分配器原语**:`nextNumber(used: Iterable<number>): number`
  = `max(0, ...used) + 1`(空集 1),单一实现,core 单点导出。
- **勘察范围 = 唯一性域**:每类数字 id 声明其勘察收集器(现状已有:
  req 走 `buildReqRegistry` 注册表,change 序号走 `harvestAcrossWorktrees`);
  分发与「already in use」检验**必须**用同一收集器的结果。
- **dedupe 重映射**改为消费同一分配器:首个重映射取当前 max+1,后续每占用
  一个即 +1(等价于在已用集合上迭代 max+1)——重映射序列在
  `{r1 冲突×2, r5}` 下为 `r6, r7`(旧行为 `r2` 废弃)。
- **跨 worktree 的 change 序号**维持现状(勘察范围本来就是全 worktree 并集,
  已满足「工作区内不重复」)。
- **模板变量**:`llman_sdd_unique_id` 与 `change next-id` 的 `nextNumber` 由
  同一收集器产出(现状已同源,补契约条款钉死防漂移)。

## 边界(Non-Goals)

- 不改非数字 id(change slug、spec id/capability、scenario 名、归档 dated id
  的字符串部分)——它们不是「数字分发」问题。
- 不改单根下任何既有命令的 CLI 形状,只改 dedupe 重映射的取号序列(见上,
  唯一可观测变化,spec 同步改)。
- 多根子项目的唯一性域是否升为「全仓跨根」另案(见
  `subproject-namespace-scope` 的历史讨论;若其落地,本分配器的「勘察根」
  参数化点已预留)。
- 不引入持久化计数器/tombstone(重扫描即真相,与 r35 精神一致)。

## What Changes

- `planDedupe` 的 `fresh()` 删除,改调分配器原语;dedupe 单测与 BDD 期望值
  由「最小空闲」改「max+1 序列」。
- 新增契约条款:数字 id 分发 = max+1 单点原语 + 工作区唯一性检验同源;
  `peripheral-commands`(dedupe 段)与新增数字-id 分发条款同步落地。
- 显式取代「max+1/smallest-free 有意分叉」旧红线(design 层)。

## 场景草案(apply 阶段落 BDD)

- dedupe:`{r1 冲突×2, r5 已用}` → 重映射序列 `r6, r7`(非 r2)。
- 分配器单测:空集 → 1;乱序/含非规范化输入 → max+1。
- 契约:change 序号、req 取号、模板变量三者对同一收集器断言同值。
