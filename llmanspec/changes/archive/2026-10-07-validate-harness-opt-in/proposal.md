---
depends_on: []
branch: sdd/validate-harness-opt-in
base_branch: main
base_sha: f9342ebeb584d569d55f64eab1b1dab95a3a59a9
---

# validate 全量 harness 改为 --check 显式 opt-in,缺省只做结构门

## Why

`validate` 配置了 `specs.check_command` 时缺省执行全量 harness（本仓 = `bun test tests/bdd`，实测 20.5s/次：184 场景 × 真实 CLI 子进程）。agent 在 apply 阶段按纪律反复运行 `validate`（编辑→验证→修→再验证），每一轮都白付 20.5s；`--all-roots` 多根场景线性放大。成本与输入是否变化完全解耦，而「门禁证据必须来自真实 harness」的纪律要求又让 `--no-check` 变成"放弃证据"的两难。

设计决策（用户 2026-10-07 拍板）：**全量 harness 改为 `--check` 显式 opt-in；缺省只做结构/状态门（<100ms）；`--no-check` 保留为显式声明"放弃 harness 证据"（与缺省同效，供报告引用）**。实施期的常规验证走"最小单元 → 定向 BDD → 显式全量"逐级扩大的纪律（见 AGENTS.md 新增工程规则与 apply/verify skill 引导）；`change finalize`/`change archive` 的预合并验收**保持原样**——硬约束每次收口至少 1 次全量真实 harness，保证验收底线。这消除了 agent 循环的实践浪费，同时用收口闸保住"至少一次全量 + 证据真实"。

## What Changes

- `llmanspec/specs/validation.feature` r13：条款由「配置 check_command 时 MUST 缺省执行 harness」翻转为「MUST NOT 缺省执行；`--check` MUST 显式执行；`--no-check` MUST 跳过（与缺省同效，供显式声明放弃证据）」；配套场景改写。r48 三处观察 harness 执行的场景补 `--check`。
- `apps/cli/src/commands/validate.ts`：`makeHarnessGate` 缺省（无旗标）映射为不执行（'off'），`--check` → 'on'，`--no-check` → 'off'（显式制）；`--check`/`--no-check` 的 help 文案与 harness 启动 banner 同步更新。
- `tests/bdd/steps/validation.ts`：r13/r48 场景改写对应的步骤绑定同步（新增 `--check` 形态）。
- `tests/unit/validation.test.ts`：T5 核心语义测试保持（core 的 `default` 分支语义不变：配置时执行）并补充说明 CLI 缺省不再下发 `default`。
- `llmanspec/AGENTS.md`：工程规则「门禁证据必须来自真实 harness」改写为与 opt-in 语义一致（validate 结构门不声明 harness 证据；`--check` 与 finalize/archive 才承载全量证据），并新增「验证阶梯」纪律（unit → 定向 BDD → `validate --check` → finalize，逐级扩大）。
- `packages/core/templates/{zh-Hans,en}/skills/{llman-sdd-apply,llman-sdd-verify}.md`：写入验证阶梯引导与新 validate 语义；随之 `init --update` 刷新 `.agents/skills` 并重生 golden 基线。

## Capabilities

- `validation`：r13「spec 验证命令执行与 check 旗标」条款翻转；r48 场景补 `--check`。
- 模板/AGENTS 面：skills 模板（apply/verify）与工程规则，非 live spec 合约，经本 change 一并刷新。

## Impact

- 行为差异：`validate`（配置了 check_command 且未给 `--check`/`--no-check`）不再执行全量 harness——结构门照常，harness 证据需显式 `--check` 或经 finalize/archive 取得。
- 兼容面：`--check`/`--no-check` 旗标均保留，无删除；`LLMAN_SDD_HARNESS_ACTIVE` 嵌套守卫、unconfigured `--check` INFO、`--check has no effect` 语义全部维持。
- `change finalize`/`change archive`：行为不变（预合并验收仍强制真实 harness）。
- CI：`bun test tests/` 与 qa 门禁不经 validate，不受影响。
- 无迁移/兼容性路径；无 schema/命令增删。
