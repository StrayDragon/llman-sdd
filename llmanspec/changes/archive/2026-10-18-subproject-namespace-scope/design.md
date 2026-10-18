# 设计：多根实例下的命名空间作用域与实例根解析收口

## 决策记录

| # | 议题 | 决策 |
|---|---|---|
| 1 | 唯一性域是否扩大 | **不扩大**，把现状冻结成显式契约：四类命名空间的域 = 单一实例根；跨根同名/同号合法 |
| 2 | 跨根同号怎么表现 | 非阻断，作为 INFO/可观测信号出现在聚合面；单根校验 MUST NOT 报 ERROR |
| 3 | 跨根消歧语法 | **不加新语法**，一律经既有 `--directory`；MUST NOT 引入 `<path>#<id>` / `<root>:<id>` |
| 4 | change id 域 | per-root：每个实例根可带自己的 `llmanspec/changes/`；跨根同名 change 合法；分支仍是 git 级共享 |
| 5 | 跨根写入 | 硬约束「写入默认限当前实例根」+ 可执行场景；仅当实施期实测违约才补路径守卫 |
| 6 | 单一归属门 | **不回归**（0.8.0 已移除）；历史理由记档；与新契约相反的孤儿步骤反写为「不回归」场景 |
| 7 | r109 落差 | **全量补齐**（读侧声明 + 写入命令接入同一算子），不留给另案 |
| 8 | 观测覆盖面 | 统一观测段覆盖四类命名空间，含 change id 粒度（聚合今天只跑 specs 粒度） |
| 9 | r109 豁免 | 覆盖清单写实；两处显式豁免：`init`（位置参数 `[path]` 是等价旋钮）、`self *`（无实例根语义） |
| 10 | 条款落点 | 以维护性为目标：新面集中进新 capability，旧条款只加引用（搬迁另案） |
| 11 | 重排扫掠范围 | 本 change 只做「新面集中」；r91 / r109 / r94 的域收敛重排另立紧随的 change |
| 12 | 新 capability 边界 | 横切原则 + 三类未声明域（change id / capability id / 非数字 id）；req id 域仍以 r94 为 SSOT，只引用不复读 |
| 13 | 新 capability 命名 | `scope-boundaries` |
| 14 | 观测的要求与形状 | **分置**：要求（必须可观测、不阻断）住 `scope-boundaries`；形状（段名/字段/排序/单根不产出）住 validation r91，与其兄弟形状规则同处一文件 |
| 15 | 观测粒度 | 明细对 `{namespace, value, roots[]}` + 计数汇总 + human 处置指引（machine 不带指引） |
| 16 | 无有效实例 | 完全对齐 r109：报 `no llmanspec root at or above <path>`（exit 1），不再就地新建；子目录 cwd 归位最近实例根 |
| 17 | `nextReqId` 落差 | 纳入本 change：改调 `nextNumber` 原语（零语义变化） |
| 18 | 测试 seam | 复用既有 harness；新建 `tests/bdd/steps/scope-boundaries.ts`，把双根 helper 上提 `shared.ts` |
| 19 | 升级路径 | 追加到 `migrations/v0.9-v0.10/README.md`，与「只读命令接入根发现」并列 |
| 20 | 写入约束豁免与验证 | 默认限根 + 两处豁免（`init --update` 扫块、显式路径参数）；场景覆盖三类写面代表 |
| 21 | frontmatter | 新 title；`depends_on` 保留（前置已归档落地，图显 ✓ done，留接合点血缘） |
| 22 | 孤儿步骤 | 反写成「不回归」可执行场景，把决策钉成行为守护，而非只留在文本里 |

## 关键决策的展开

### 为什么冻结 per-root 而不做全仓唯一（#1）

全仓唯一会立刻反噬三条既有承诺：① r91 明文「缺省 MUST NOT 自动聚合」——跨根取号要求每次
分配都扫全仓，成本从「一次 specs 扫描」变成 O(roots × 扫描)，与缺省不聚合直接冲突；② r94
已把「各根注册表独立」写成契约并配了 BDD pin（子根 `r6` 在 `@req:r5` 场景下取号），改域等于
推翻一条已落地的合约；③ `spec` 助手是**纯读**操作，跨根聚合会让「取号」变成隐式的全仓副作用。
冻结 per-root 后，多根歧义由「可观测信号 + 显式 `--directory` 消歧」承担，代价可控。

### 为什么要求与形状分置（#14）

`validate --all-roots` 的聚合输出今天已经有「按根分组」的形状规则（r91）。把新观测段的三条
形状规则（字段名、确定性排序、单根不产出）搬到 `scope-boundaries` 会让同一份报告的形状规则
散在两地，改报告时容易只改一处 → 形状归 r91，`scope-boundaries` 只说「MUST 可观测、MUST NOT
阻断」。这是「域声明」与「表面形状」的常规分工，也让单根零漂移这条断言有唯一落点。

### 单根零漂移怎么守（#1 / #2 / #8）

新增字段必须是**条件产出**：仅当发现 ≥ 2 个根时才出现 `crossRootCollisions`，单根模式连空数组
都不产出。`tests/unit/roots.test.ts` 已有「单根向后兼容（r91 铁律）」的断言范式，本 change 在同一
位置加回归锁——断言解析结果的 `roots === undefined` 之外，另断言观测段字段缺席。

### 唯一可观测行为变更与迁移（#16 / #19）

`change` / `archive` 从「cwd 字面量为根」改为「向上取最近有效实例」后，两处用户可感知变化：
① 在子目录（无自有 `llmanspec/`）里跑 `change new`，落盘位置从 `./llmanspec/changes/` 变为
仓库根的 `llmanspec/changes/`；② 在完全没有实例的目录里跑 `change new`，从「就地新建」变为
域错误。前者是修正（旧行为会让 change 落在无实例的裸目录里），后者是 r109 的必然推论。窗口
`v0.9-v0.10` 已在收录同类破坏面（第 4 条：只读命令接入根发现），故并列追加。

## 风险与缓解

- **聚合成本**：`--all-roots` 需为每根收集 specs + change 粒度。聚合仅在显式旗标下触发，成本
  可接受；缺省路径不新增任何扫描。
- **`scope-boundaries` 与 r94 的复读风险**：靠「r94 是 req id 域 SSOT，新 cap 只引用」这条硬
  约定隔离；新 cap 不写任何 req id 域的细节数值行为。
- **写入守卫的过度收紧**：`init --update` 与显式路径参数是**有意**的跨根写。守卫必须建在
  「默认目标解析」这一层，而不是「任何写入实例根之外即拒绝」，否则会把既有功能判违规。
- **条款与实现的时序**：propose 期落裸规则（runner 对未绑定步骤抛错，先落场景必红），apply 期
  随实现同步转写为可执行场景并补 step 绑定——沿用 `subproject-llmanspec-discovery` 的既有纪律。

## 测试边界（seam）

不发明新边界，全部复用既有 harness：

- **纯函数层**：`tests/unit/roots.test.ts` 的 `ioFrom(dirs, files)` 注入式夹具（观测段计算、
  单根不产出、排序确定性）。
- **BDD 层**：`tests/bdd/run.test.ts` 显式注册步骤模块；子进程经 `tests/bdd/steps/shared.ts` 的
  `CLI` / `makeTempRepo` / `TempRepo`。双根夹具已存在于 `tests/bdd/steps/roots.ts`
  （`SUB = 'packages/tui'`、`seedSubRoot`、`seedRootCheck`）——本 change 把这三个 helper 上提
  `shared.ts`，新建 `tests/bdd/steps/scope-boundaries.ts` 并按 capability 对齐归属。
- **行为变更回归**：三类写面（spec 侧 `dedupe`、change 侧 `change new` / `finalize` 改名、
  archive 侧 `freeze`）在双根 fixture 上断言「另一根文件字节零改动」。

## 历史决定备查（不回归的理由）

- `CHANGELOG.md:88`：0.8.0 的 `drop-review-stamp-and-scope` 移除了「validate 去 scope 存在性
  门禁与跨根单一归属检查」。该决定把「路径归谁」从错误门降级为观察面，跨根 scope 重叠因此
  **不**构成校验失败。本 change 的 `scope-boundaries` 条款把这条历史决定写成显式 MUST NOT，
  并把仓库里仍断言「报 single-ownership 错误」的三个孤儿步骤反写为对偶场景。
- 前代参照：`../llman.old-rs-impl-sdd` 子项目提案（issue #6）结论为推迟；本 change 是其收口。
- 接合点：`unify-numeric-id-allocation`（已归档）把数字 id 分发收敛为 `nextNumber` 单一原语，
  并明文把「跨根唯一性域」留给本 change；本 change 的结论是不扩大域，因此**不动**该原语的
  勘察范围，只把它被绕过的调用点（`nextReqId`）收敛回原语。
