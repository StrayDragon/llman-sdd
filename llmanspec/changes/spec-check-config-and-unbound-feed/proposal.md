---
depends_on: []
needs_specs_change: true
---

## Why

1. **bdd.run_command 语义漂移**：配置名的「bdd」暗示 BDD 测试框架，其真实角色是 **spec 验证 harness**（`validate --check/--no-check` 执行、finalize/archive 的 close-out 门、模板变量 `bdd_run_command`、`framework` 推导缺省）。且 harness 触发依赖「存在已绑定场景」（close-out 门只看 `hasExecutable`），与「绑定到真实逻辑是可选的」产品方向相悖——全未绑定的仓库没有验证路径。
2. **agent 需要自省入口**：以 gherkin 描述特性、用户可选是否绑定真实逻辑的前提下，agent 需要一个 CLI 端点来「取 N 条未绑定需求 + 对应文件」考虑实现，缺省 1 条 + 省略号 + 剩余数量 + 提示。
3. **术语过载与口径不一**：`pending` 同时指「无嵌套场景的规则」与「未勾任务」；「spec」在口头上被同时当作 capability 文件与规则块；「未绑定」在度量（0 场景）与实现就绪（无可运行场景）之间摇摆。需统一为一个自洽语汇。

## What Changes

- **配置**：`bdd:` 段 → `specs:` 段（`framework` 随迁、`run_command` → `check_command`、`verify_prompt` 随迁）；语义收敛为「整个 spec 验证」harness；对旧 `bdd:` 段做兼容提升（字段级映射）+ 加载期 WARNING；`migrations/` 写升级 README。
- **行为收敛**：close-out 门在 `specs.check_command` 已配置时对一切改 specs 的 change 必跑（删除 `hasExecutable` 依赖）；未配置时跳过 + WARNING 引导。validate 侧触发保持不变（本就不过滤绑定），文案「bdd harness」→「spec check」统一。
- **术语与判定统一**：`requirement/需求` = `规则:` 块、`spec/specs` = capability 文件（消歧）；「未绑定」全局唯一定义 = **无 runnable 嵌套场景**（0 场景或全部 `@skip/@experimental`）；机器字段一致化 `ruleEnforcedCount → requirementBoundCount`、`rulePendingCount → requirementUnboundCount`；review `pending` 信号 → `unbound`；validate 聚合 INFO 与 specs-compact 引导措辞同步。
- **新命令**：`spec unbound [--limit N]` 取未绑定需求（含 capability、文件路径、句柄、描述），缺省 limit 1 + 剩余数 + 提示；limit 语义对 TOON/JSON/human 所有输出模式统一（`--limit 0` = 全部）；排序确定性（文件扫描序 + 文件内规则序）。
- **联动面**：模板变量 `bdd_*` → `specs_*` 并 `init --update` 刷新 skills；本仓库 config.yaml 狗粮改新形；golden 基线、pending-gate 脚本随字段改名同步。

## Capabilities

- config-schema（`specs:` 段字段契约与旧 `bdd:` 兼容提升）
- config-command（config 展示面）
- validation（r13/r48 harness 文案、聚合 INFO 措辞、close-out 语义消费）
- review-freeze（`pending` → `unbound` 信号）
- peripheral-commands（`list --specs`/`show` morphology 字段、`spec unbound` 新命令面）
- init-generators（模板变量 `specs_*`）
- monorepo-structure（pending-gate 引用名与说明）

## Impact

- **破坏性（配迁移）**：配置键 `bdd.*` → `specs.*`（旧形兼容提升 + WARNING，未来移除）；`list --specs`/`show` JSON 字段名 `ruleEnforcedCount/rulePendingCount` 改名（已随本仓狗粮同步升级消费方：pending-gate 脚本、golden、review 输出）。
- **本仓库**：config.yaml 改新形并刷新 `.agents/skills`（`init --update`）；golden 基线更新；13 capability 全部规则均含可运行场景（0 裸规则），统一口径不触发 pending-gate 基线变化。
