# Tasks: unify-numeric-id-allocation

测试 seam（已确认）：双 seam——`tests/unit` 直测 core 纯函数 + 既有
Gherkin→bun:test runner（`tests/bdd/`，CLI 子进程经 `tests/helpers/spawn.ts`）。
不新增 harness、不新增 spec 条款（契约语义折进既有 r43/r60 三处改写）。

- [x] t1 分配器原语 + dedupe 消费改造（core）
  - `packages/core` 新增单点导出 `nextNumber(used: Iterable<number>): number`
    （= `max(0, …used) + 1`，空集 1；单趟循环折叠实现，禁用
    `Math.max(...used)` spread）；删除 `planDedupe` 内 `fresh()` smallest-free
    探号循环，改调原语语义：max 从既有 `ruleReqIds(entries)` 内存集合单趟
    派生（零额外文件系统扫描），首个重映射取 `max+1`，后续运行游标递增
    （每项 O(1)，不重复扫描）。零持久化状态：不写计数器/缓存文件。
  - 改写 spec-authoring r43 条款：「重映射为空闲短 id……逐个重取号」→
    「重映射为分配器 max+1 序列（首现保留不变）」；dedupe 场景期望值由
    「空闲 id」改「max+1 序列 id」，新增场景钉死 `{r1 冲突×2, r5 已用}` →
    `r6, r7`。
  - 单测：分配器空集 → 1、乱序/非规范化输入 → max+1；`planDedupe` 冲突
    场景期望 `r6, r7`（非 `r2`）。
  - 验证：`bun test tests/unit/<相关>` → `bun test tests/bdd -t "dedupe"`。

- [x] t2 模板变量收集器统一（CLI，与 t1 可并行）
  - `apps/cli` `deriveNewId` 的 `llman_sdd_unique_id` 改由
    `harvestAcrossWorktrees` 产出（CLI 层注入 git；core 渲染签名不变），
    与 `change next-id` 同一收集器；同一次命令调用内 harvest 结果只算
    一次、按需复用，不新增任何持久化缓存。
  - 修正 change-lifecycle r60 漂移文案：「全树含归档的最小空闲编号」→
    「全 worktree 并集勘察范围的 max+1，与 `change next-id` 同收集器」。
  - 单测：配置模板的多 worktree 临时仓中，模板变量与 `change next-id`
    输出同值（行为前后对比在 change 分支相对 merge-base 测量）——落地为
    change-lifecycle r60 可执行场景（经真实 CLI 驱动，同值断言等价）。
  - 验证：`bun test tests/unit/<相关>` → `bun test tests/bdd -t "template"`。

- [x] t3 红线改写收口契约（specs，[blocked-by: t1, t2]）
  - 改写 peripheral-commands r60「有意 divergent 于前代 smallest free
    语义」旧红线：以 design.md 的红线取代声明为准，落「数字 id 分发 =
    max+1 单点原语 + 工作区唯一性检验同源；dedupe 与模板变量同受此约束」。
  - 复核 peripheral-commands r94「max+1 取号语义不变」：表述仍真，不改
    （跨根唯一性域归 subproject-namespace-scope）。
  - 验证：`llman-sdd validate --all --strict`（task 全勾后作完成判定）+
    `just qa` 全绿。
