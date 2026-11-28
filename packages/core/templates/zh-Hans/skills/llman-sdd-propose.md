---
name: "llman-sdd-propose"
description: "行为合约要改时使用。创建提案、绑定分支并提交规格。小改动用 quick，只记想法用 draft。"
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Propose

创建带规划文档的新 change（proposal + tasks；design 可选）：**先** `change start` 绑定分支，**再**在绑定分支编辑 `llmanspec/specs/<capability>.feature` 并提交规格。

## Pipeline 位置

{{ unit("skills/git-native-flow") }}
{{ unit("skills/human-readable-summary") }}

> 当前在 propose 阶段：规划文档 → 绑定分支 → 提交 specs（至 specs-landed 门通过）→ 下一步 `llman-sdd-apply`。小改动走 `llman-sdd-quick`，只记想法走 `llman-sdd-draft`。

## 硬约束

- **人类定理只读**：先查阅 `llmanspec/theorems/`，提案不得违背既有硬不变量，也不得修改定理文件。
- **change id 非阻塞**：用户给了就用；否则推导合法 kebab-case id（动词前缀），宣布后直接继续，不得等确认。
- **specs 唯一事实来源**：只在绑定后的非默认分支编辑 `llmanspec/specs/**`，不得在默认分支改 specs；不得中途问“是否继续”。
{% if extra_skill_continue %}
- **change 已存在**：STOP。specs-landed 门已绿 → 宜接 `llman-sdd-apply`；否则用 `llman-sdd-continue`。
{% else %}
- **change 已存在**：STOP。specs-landed 门已绿 → 宜接 `llman-sdd-apply`；否则补齐缺失工件。
{% endif %}
- **frontmatter 固定 schema**：`proposal.md` 只填合法字段（`title` 必填一句话概念标题，`depends_on`/`blocks`/`needs_specs_change` 等），不得写 `status`/`priority`/`author` 等集外字段。

## 核心步骤

1. **预检与定界**：读 `llmanspec/config.yaml`；跑 `llman-sdd validate --all --strict` 与 `llman-sdd list --specs`，直读相关 `.feature`。非行为合约改动转 `llman-sdd-quick`。
2. **创建规划工件**：运行 `llman-sdd change new <change-id>` 充实 `proposal.md`（Why / What Changes / Capabilities / Impact），有权衡时补 `design.md`。破坏性合约变更必须规划 `migrations/v<from>-v<to>/` 升级路径。
3. **撰写 `tasks.md`**：先确认由 `.feature` GWT 驱动的公共测试边界（seam）；按垂直切片拆任务并标 `[blocked-by: <id>]`。**`tasks.md` 只列实现与验证任务**：收口（`change archive`）是流水线步骤，不得列为任务。前后对比类完成判据必须注明在 change 分支上测量（相对 merge-base）。
4. **绑定分支并提交 specs**：先运行 `llman-sdd change start <change-id>`，再在绑定分支编辑 `.feature` 并 commit（无合约编辑时设 `needs_specs_change: false`）。`stage=full` 且 specs-landed 门通过即可进 apply；`readyToImplement=true` 是 verify/finalize 的完成信号。
   - **结构化新增首选**：用 `llman-sdd spec next-req-id`、`llman-sdd spec add-req`、`llman-sdd spec add-scenario`、`llman-sdd spec new`、`llman-sdd spec resolve-req`。
   - **可执行场景优先判据**：凡 GWT（假如/当/那么）可自动判定的行为 必须 落成嵌套 `场景:`（例如：“当 运行 validate 后，那么 stdout 为 TOON 且退出码为 0”）；抽象目标或治理约束暂不可自动化时可留裸 `规则:` 并在 proposal/design 记录理由。
   - **可选 `specs:` runner**：若 `config.yaml` 缺 `specs:` 且含可执行场景，先询问用户是否启用，不得静默添加。
   - **Studio 草稿协商**：收到 Studio 草稿 ID 时，优先用 `llman-sdd studio diff`、`llman-sdd studio validate`、`llman-sdd studio comment reply` 与 `llman-sdd studio revise` 核验并回推；绑定特性分支后再 `llman-sdd studio apply`（任意分支可 `--dry-run` 预览）。
5. **校验**：运行 `llman-sdd validate <change-id>` 通过结构门（`--strict` 留到实施完成时判定）。通过后宜接 `llman-sdd-apply`。

{{ unit("spec/feature-contract") }}

{{ unit("skills/cli-footer") }}
{{ unit("skills/validation-hints") }}

{{ unit("skills/structured-protocol") }}
