---
name: "llman-sdd-studio-drift"
description: "直改代码后核对 Runtime Trace 或 @llmanspec: 漂移切片时使用。按四类分流法则与 Studio 协作。不用于正常提案立项。"
metadata:
  version: "0.1.0"
---

# LLMAN SDD Studio Drift

处理绕过常规 SDD 流程的直接代码改动、Runtime Trace 后门转移与逻辑漂移校准。全流程以离线确定性切片为事实依据，不得静默改写 `llmanspec/specs/`。

## 0-Token 确定性采集

1. **运行轨迹对账**：运行 `llman-sdd studio drift --trace <file.jsonl> --json` 检出 `shadowTransitions`、`uncoveredTransitions` 与 `unknownMachines`；CI 拦截场景可加 `--fail-on-shadow`。
2. **代码锚点最小切片**：运行 `llman-sdd studio drift --since <git-ref> --json` 扫描跨语言 `@llmanspec:<reqId>` 与 `@llmanspec:machine:<machineKey>` 注释锚点，只读取命中的 git hunk 与对应规则原文。
3. **非破坏推送反向提案**：确认存在业务意图变化时，运行 `llman-sdd studio drift --trace <file.jsonl> --write-state`，仅向 `.llman-sdd/studio/states/` 写入 `source: "drift-trace"` 的待审修订层，绝不直改 `llmanspec/specs/`。

## 四类直改代码分流法则

按采集结果对每次直接代码改动归类处置：

| 类别 | 判据 | 动作 |
| --- | --- | --- |
| 1. 纯内部重构 | 未命中 `@llmanspec:` 锚点且无 `shadowTransitions` | 直接放行，不必修改 `llmanspec/` |
| 2. 合规细化但规格偏粗 | 未破坏既有真理，但边界或守卫值得补充说明 | 经 `llman-sdd studio comment reply` 或 `llman-sdd studio revise` 提轻量修订提案，由人类决定是否收编 |
| 3. 破坏既有真理（真理胜出） | 出现违规后门状态或绕过既有守卫 | 立即修复违规代码，不得改写 `llmanspec/specs/`，重跑 `llman-sdd studio drift --trace <file.jsonl> --fail-on-shadow` 直到退出码为 0 |
| 4. 业务意图真变了（追认新意图） | 团队确认新增状态或转移属于新业务需求 | 运行 `llman-sdd studio drift --trace <file.jsonl> --write-state` 推送反向红绿修订层到 Studio，由人类在画布或世界线裁决并走特性分支补录变更 |

## 协作红线

- 必须 保持 100% 离线确定性，以 `llman-sdd studio drift` 产出的 Trace 证据与最小切片包为准，不得凭空猜测未覆盖分支。
- 不得 在默认分支直接改写 `llmanspec/specs/`；需预览落盘差异时可运行 `llman-sdd studio apply <state-id> --dry-run`。
- 收到 Studio “真理胜出” Prompt 时，必须 按 Prompt 中的 `machineKey` 与 Trace 行号逐条清理违规代码并复跑门禁。

> 命令细节用 `llman-sdd <cmd> --help` 查看；命令参考以 CLI 为准，skill 不内嵌命令表。
> 文中“规约”= 本项目 `llmanspec/specs/` 下的 `.feature` 文件；用 `llman-sdd list --specs` / `llman-sdd show <capability>` 查全文。

## Context
- 先查状态再动手：change/spec 状态以 `llman-sdd show/list/validate` 输出为准；读 spec 全文前先 `llman-sdd list --specs`，再直读 `.feature`。

## Goal
- 达成一个可验证结果；报告附结果路径与校验状态。

## Constraints
- 遵守正文硬约束（不复读）。先判断规模选路径：合约变更走完整 SDD，实现层走 quick；不确定选完整 SDD。改动最小；已知校验错误不得强行继续。

## Workflow
- 每步以 `llman-sdd` 命令结果为事实来源；改动工件后必跑 `llman-sdd validate`；命令细节见 `llman-sdd <cmd> --help`。

## Decision Policy
- 高影响歧义先澄清再继续；事实自己查证，只有决策问用户。

## Output Contract
- 先给人读摘要（结论 / 风险 / 待决策），机器细节随后。

## Ethics Governance
- `ethics.risk_level`：low——只读写本仓库与 `llmanspec/`，无外发动作；正文另有声明时按正文执行。
- `ethics.prohibited_actions`：违反正文硬约束的动作；用户未明确要求时，不得 push、发 PR 或向外部上传。
- `ethics.required_evidence`：结论必须给出命令输出或文件路径；门禁状态以 `llman-sdd validate` 输出为准。
- `ethics.refusal_contract`：门禁 CRITICAL 未清零时，不得进入下一阶段；自修复达到上限时，报告 blocker。
- `ethics.escalation_policy`：改动 SDD 合约、模板，或执行不可逆动作前，必须先取得用户确认。
