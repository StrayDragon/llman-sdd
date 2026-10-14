---
name: "llman-sdd-apply"
description: "循环实施已提案 change 的 tasks：写码→测试→失败自修复→门禁全绿。propose 完成、specs 提交后进入。"
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Apply

按顺序在一轮内完成 `llmanspec/changes/<id>/tasks.md` 的所有任务：实现 → 补测试/验收 → 跑门禁 → 失败自修复重跑 → 全过后报告。除非明确 blocker，不得中途问“要不得继续”**。

## Pipeline 位置

{{ unit("skills/git-native-flow-brief") }}

```mermaid
flowchart LR
    propose["llman-sdd-propose"] --> apply["★ llman-sdd-apply"]
    apply --> verify["llman-sdd-verify"]
    verify --> archive["llman-sdd-archive"]

    style apply fill:#fff3cd,stroke:#ffc107,stroke-width:3px
```

> 📍 进入前须 specs-landed 门通过（或 `needs_specs_change: false`）；`readyToImplement=true`（全门绿）是本轮的完成信号 → 下一步 `llman-sdd-verify`。

## 硬约束

- **唯一事实来源驱动**：`proposal.md` / `design.md` / `tasks.md` 与分支上的 `llmanspec/specs/**`；specs 的行为合约条款逐条落实。
- **范围锁定**：只做当前 change 范围，不得顺手修无关问题；改动保持最小。
- **管辖范围**：SDD 流程（change 分支、proposal、specs 编辑门）只约束行为合约面——`llmanspec/**` 及其产物对齐（如 `.agents/skills` 渲染新鲜度）。仓库其余文件（构建脚本、CI、一般文档、测试实现）按项目常规工程流程直改直提交，不经 change 包装；改动触及行为合约语义时，回到对应 skill 流程。
- **不得猜测**：需求不明或 specs 与现实矛盾 → STOP 报告，不自行假定。
- **不留旧兼容层**：change 要求改行为就全量升级到新写法，除非 tasks/proposal 明确要兼容。
- **收尾**：该轮以宜接 `llman-sdd-verify` 收束；finalize/archive 归 `llman-sdd-archive`（不得在自修复循环里 finalize）。

## Commit 策略

- **change 分支上提交自由**（`change finalize` 不得求干净树）：按 task/里程碑分段提交，或留脏交给 finalize 一次收尾——均为一等公民。
- **默认收尾**：全部 task 过门禁且 verify 全绿后，`llman-sdd change finalize <id>` 自动提交 `archive(sdd): <change-id>`（未提交 diff + frontmatter + 改名一笔）。不得在 apply 循环内 finalize。`--no-commit` 跳过自动提交（手动/CI 历史、pre-commit hook 冲突）。
- **blocker 中断**：因 blocker STOP 前先做**一次** WIP commit（如 `wip(sdd): <change-id> <摘要>`）保全现场再报告。

## 步骤

### 0) Preflight（必须）
- 读取并遵守 `llmanspec/config.yaml`、`AGENTS.md`（若存在）。
- `git status --porcelain`：工作区不干净且改动不属于本 change → 先 `git stash push -u -m "llman-sdd-apply autopilot backup"`。
- `llman-sdd validate --all --strict`：失败且与本 change 无关 → 停下报告（工件不一致则无法以事实来源驱动实现）。
- **specs 清单可读**：`llman-sdd list --specs` 返回清单且无错误；异常 → 停下报告。

### 1) 选定 change id 并查前置
- 已提供则直接用；否则从上下文推断，不明确就跑 `llman-sdd list --json` 让用户选。始终说明“使用变更：<id>”并告知如何覆盖。
- 确认在经 `llman-sdd change start <id>` 或 `change attach <id>` 绑定的非默认分支上（仅重绑用 `--force`）。分支上的 specs 即唯一事实来源——不得在 `changes/<id>/specs/` 下编写。
{{ unit("skills/stage-guard") }}
- 用 `llman-sdd context --task "<proposal 目标>" --paths "<specs scope>"` 获取匹配 `<paths>` 的 specs。
  - context 不可用 → 先 `llman-sdd index check`：stale/缺失则 `llman-sdd index rebuild` 后重试；fresh 仍不可用（`LLMAN_SDD_INDEX_CHAT_MODEL` 未设）→ 改用 `llman-sdd list --specs` + 直读 `.feature`——勿循环 rebuild。

### 2) 通读事实来源工件
- `llmanspec/changes/<id>/proposal.md`、`design.md`（如有）、`tasks.md`
- 分支上的 `llmanspec/specs/**`（`<capability>.feature`）

把 proposal/design 的决策整理为不可违反的硬约束清单；把 tasks.md 转成最小可执行步骤序列（保持原顺序）。

### 3) 展示状态
- 进度“N/M tasks complete”+ 接下来 1–3 个未完成任务的简短概览。

### 4) 逐任务实施（循环）
对每个未完成 task：
1. **实现**：严格按 task 描述 + specs 要求，改动最小。
2. **完成后立刻勾 checkbox**：`- [ ]` → `- [x]`。**收口不是 task**：`change finalize` / `change archive` 是流水线步骤，不得 出现在 tasks.md——若已列（如“收口——finalize”），删掉（收口的任务门要求全部任务已勾）。
3. **编辑与验证串行**：验证 必须 在编辑落盘后执行；不得 把编辑与测试/校验放进同一批并行工具调用（可能读到旧文件，产生假失败/假通过）。
4. task 不明、遇 blocker、或 specs/design 与现实不一致 → STOP 报告，不自行假定。

### 5) 验证与自修复循环（每个 task 或每批 task 后跑一次）
- 测试与静态门禁：执行本仓已声明的验证手段——以仓库文档与配置记载为准；已配置 `specs.check_command` 的项目，以 `llman-sdd config` 读得的命令为准。仓库未声明时，询问用户；不假定任何具体任务工具存在。
- 分支上按需编辑 `llmanspec/specs/<capability>.feature`（扁平或目录主文件；统一原生分层：`@req:<id>` 挂 `规则:` 块头、嵌套 `场景:` 为可执行示例），spec 改动后跑 `llman-sdd validate --specs`；分支上可自由提交。
- SDD 校验：`llman-sdd validate <id> --strict`

**验证阶梯（opt-in 纪律，按成本逐级扩大）**：
- L1 最小单元：已声明验证手段中能直接加载被改模块的最快一层，仅覆盖当前改动点。
- L2 定向行为：定向执行已声明验证手段中匹配当前场景的子集（已配置 `specs.check_command` 时优先），只复现目标行为。
- L3 显式全量：`llman-sdd validate --check`（配置 `specs.check_command` 时执行全量 harness；缺省 validate 不再执行 harness）。
- L4 收口兜底：`change finalize` 预合并强制真实 harness——每次收口至少 1 次全量。
- 自修复循环默认用 L1/L2 快速复现；只有需要全量验收时才 L3；避免无谓白付全量成本。

**门禁证据**：
- 缺省 `validate` 只做结构/状态门，不声明 harness 证据；harness 证据 必须 经显式 `--check` 或收口验收取得。
- 门禁结论 必须 来自真实 harness：声称 harness 合格时 必须 已用 `--check`（或收口）；缺省结构门的通过不是通过；harness 失败 必须 先查根因（环境变量泄漏、嵌套调用守卫、工作目录错误等），不得 以“固有/自指属性”定性后绕过。
- 前后对比类判据（计数、基线）必须 在 change 分支上测量（相对现算 merge-base）；默认分支测得的值通常恒为基线，不构成证据。
- 重构或批量替换类 task：必须 对比改动前后测试用例数；门禁全绿但用例数下降视为失败。

**失败 → 自修复（不得问要不得继续）：**
1. 解析失败原因（测试 / lint / 格式 / 校验）。
2. 判定是否难定位 bug（原因不明 / 间歇 flake / 回归看不穿）：
   - **不是**（明确的 lint/格式/编译/校验错误）：最小修复（不扩范围），先重跑最小失败复现命令，再重跑全部门禁。
   - **是 → 升级诊断子流程**：
     1. **先建一个能复现失败的命令**（快、确定、agent 可跑、能在此 bug 上变红）——驱动真实 bug 路径并断言用户症状。**不得 在没有它之前猜原因**（盯着代码空想正是要防止的失败）。
     2. 运行确认变红 → 最小化复现（逐个剔除输入/调用/配置/数据，只留可复现的最小输入与调用）。
     3. 生成 **3–5 个排序假设**，每个可证伪（“若 X 是因，改 Y 会让 bug 消失”）。
     4. 单变量验证（一次只改一个），找到根因后修复。
     5. 没有合适 seam 写回归测试时，记录该架构缺口（交 `llman-sdd-arch-review`；未启用时写入本 change 的 `proposal.md` Further Notes 段或 `design.md`，不得 因此中断循环）。
3. 先重跑最小失败复现命令，再重跑全部门禁。
4. 记为一轮自修复：`Round N：失败点 → 修复 → 重跑 → 通过/失败`。

**自修复上限 8 轮**；超过仍不过视为 blocker：停止并输出 blocker 报告（最后一次失败命令与输出摘要、已尝试的修复）。

**人审关卡（每批 task 门禁通过后）**：进入下一批次或输出完成报告前跑 `llman-sdd review`：退出码零 → 继续；非零 = CRITICAL → STOP 修复后重跑；不得 带 CRITICAL 进入下一批次或输出完成报告。

### 6) 完成报告
所有 task 完成 + 全部门禁通过后输出结构化报告（见 Output Contract），然后宜跑 `llman-sdd-verify`。

{{ unit("skills/cli-footer") }}

{{ unit("skills/version-drift") }}

{{ unit("skills/validation-hints") }}

{{ unit("skills/structured-protocol") }}
