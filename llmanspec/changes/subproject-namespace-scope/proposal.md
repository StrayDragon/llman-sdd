---
depends_on: []
title: 子项目 llmanspec 命名空间唯一性范围决策(多根下的 id 域与分配器勘察根)
needs_specs_change: true
---

## Why

本仓已落地多根实例发现(validation r91 根发现、`validate --all-roots`、per-root
specs 注册表),但多个标识符的**唯一性承诺**仍锚定在「单实例全局」假设上。
子项目根(仓库内嵌套 `llmanspec/`,如 `packages/tui/llmanspec/`)全面消费时,
以下命名空间需要重新决策,否则会出现跨根歧义或静默冲突。

前代参照:`../llman.old-rs-impl-sdd` 的子项目提案(issue #6)——其结论是推迟,
本 draft 承接该推迟,给出落地时的决策清单。

### 先决:数字 id 分配器已单点化

`unify-numeric-id-allocation`(draft)落地后,数字 id 分发收敛为单一
「max+1 原语 + 勘察收集器」。本 change 若选择扩大唯一性域(跨根),需要改的
只是**收集器的勘察根参数**(单根 → 声明根有序并集),分配器原语与检验同源
约束不变。这是两 draft 的接合点。

### 受影响的唯一性范围(逐项决策)

1. **req id(`rN`)**:现状 `peripheral-commands` 条款明文「各根注册表独立、
   跨根不保证唯一」。子根消费时:
   - 选项 A:维持每根独立(零改动;跨根 review/dedupe 需根限定参数);
   - 选项 B:全仓唯一(收集器跨根聚合;`dedupe` 的改写必须携带根限定,
     否则改写串根)。
2. **change id**:活动 change 全局唯一门(validate r87)现按单 `changes/` 树
   判重;多根下每根 `changes/` 独立,跨根 `change start`/finalize 目标解析
   是否全仓唯一待决策。
3. **spec id(capability)**:已按根分配(根内唯一);跨根同名 capability 在
   `review --capability` / `show <id>` 的消歧路径需要根限定参数。
4. **非数字 id 不受分配器影响**:change slug、scenario 名、归档 dated id 的
   字符串部分仍按各自现有规则,唯一性域决策只涉「在哪个范围查重」。

### 边界(Non-Goals)

- 不改单根下任何行为(单根输出逐字节不变是 r91/r109 承诺)。
- 不在本 change 决策 A/B——仅冻结问题域、与分配器 draft 的接合点、以及
  「跨根改写必须携带根限定」的实现约束。

## What Changes

- (占位,propose 阶段按 A/B 决策结果填写。)

## 场景草案(方向性)

- 双根同名 capability:`show <cap>` 在歧义时报错并列出根限定用法。
- (若 B)跨根 req 取号:子根 `next-req-id` 看见主根已用号,分发续接 max+1。
