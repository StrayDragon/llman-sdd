---
depends_on: []
---

# 技能模板指引全量对齐:命令值域·行为语义·authoring helpers 覆盖

## Why

add-worktree-aware-lifecycle / add-worktree-hardening / polish-cli-followups 等批次落地后(34 个未 push 提交),skill templates 与 CLI 实际行为之间出现**语义漂移**:现有 r67 对账门禁只校验「命令路径存在 + 旗标已注册」,抓不到旗标**值域误用**与**行为性错述**。复核(逐条比对模板引用与 `--help`/核心实现,并在本仓库现场复现两处)发现 3 处会误导 agent 的 factual 错误(P0)、3 处死引用/不可能状态(P1)、4 项覆盖缺口(P2),en/zh 双 locale 成对存在,已安装渲染产物原样继承。

## What Changes

全部修正**双 locale(en + zh-Hans)成对落地**,渲染产物为下游:

**P0(误导 agent 产生错误行为)**
1. archive 人审检查点 `llman-sdd review --capability <id>` 传的是 change id——`--capability` 值域是 **spec id**(review.ts 按 spec entries 校验),传 change id 必然 `capability not found` 退出 1,被模板自身规则解读为 CRITICAL STOP。改为无旗标 `llman-sdd review`。
2. explore/propose/apply/quick 四处「context unavailable → index rebuild 重试」修复路径不完整:index **fresh** 但 `LLMAN_SDD_INDEX_CHAT_MODEL` 未设时 context 永远 unavailable(README 已写明),rebuild 死循环。改为双分支:stale/missing → rebuild 重试;fresh 仍 unavailable → 回退 `list --specs` + 直读 `.feature`,禁止循环。
3. archive 对 plain `change archive` 的「no auto commit」错述——核心层与 finalize 共用收口提交(必提交 `archive(sdd): <id>`)。按真实差别改写:finalize = validate sweep(`--no-check` 可跳过)+ 不要求干净树;archive = task gates + 干净树 + 绑定分支 + 非默认分支。

**P1(死引用/不可能状态)**
4. archive 删除 `--skip-specs`「tooling-only」推荐(v1 兼容 no-op,核心层无此参数)。
5. stage-guard unit「若已有 proposal+design+tasks 仍是 draft」为不可能状态(stageFor:有 design 即 ≥designed),改为「proposal+tasks 无 design(tasks-without-design)」。
6. apply-cycle `tasks[].test` 字段在任何 JSON 输出中不存在(v1 遗留),改为「task 文本写明验证命令则运行之」。

**P2(覆盖缺口/描述优化)**
7. propose 4b 纳入 spec authoring helpers 作结构化新增首选:`spec next-req-id`(全局 rN 分配)、`spec add-req` / `spec add-scenario`(写入路径自动解析扁平/目录布局,polish-cli-followups 刚落地)、`spec skeleton`(新 capability)、`spec resolve-req`(rN 反查);手改 `.feature` 保留为逃生门。
8. wayfinder frontmatter 补 `disable-model-invocation: true`(apply-cycle 已有先例,兑现「仅手动触发」声明)。
9. archive frontmatter description 补收口提交语义(one close-out commit)。
10. specs-compact 补 `project dedupe-req-ids --dry-run`(同域维护工具);archive-freeze-guidance unit 补非主检出 worktree 警告一句(r24);ff step 1 的「confirm the final id」对齐 propose 非阻塞 id 规则(derive + 宣布,不等确认)。

## Capabilities

- init-generators:模板指引内容合约——新增 r68(指引语义对齐)与 r69(authoring helpers 引导),均配 @executable 验收(id 经 `spec next-req-id` 分配)。
- monorepo-structure:r67 门禁保持不动;新增姊妹门禁 `tests/unit/template-guidance-parity.test.ts`(禁用模式 + 必含标记,双 locale 源扫描),由 r68/r69 的 @executable 场景驱动。

## Impact

- 模板源:`packages/core/templates/{en,zh-Hans}/skills/`(archive/explore/propose/apply/quick/apply-cycle/wayfinder/specs-compact/ff 共 9 对)+ `units/skills/stage-guard.md`、`units/workflow/archive-freeze-guidance.md` 两对。
- 新增测试:`tests/unit/template-guidance-parity.test.ts`。
- 下游再生:`tests/golden/baseline`(`just golden-generate`)与本仓库 `.agents/skills/`(`llman-sdd init --update`)。
- 测试边界(seam,全部复用既有 harness,不发明新 seam):① 模板源文件扫描 seam(与 r67 门禁同型,unit test);② golden 渲染基线 seam(r19 归一化 diff);③ BDD runner seam(tests/bdd 经 smoke.ts「执行命令」步骤执行 @executable 场景)。
