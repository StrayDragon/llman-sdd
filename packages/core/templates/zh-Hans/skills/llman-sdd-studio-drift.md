---
name: "llman-sdd-studio-drift"
description: "直改代码后核对 Runtime Trace 或 @llmanspec: 漂移切片时使用。按四类分流法则与 Studio 协作。不用于正常提案立项。"
metadata:
  version: "{{ llman_version }}"
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

{{ unit("skills/cli-footer") }}

{{ unit("skills/structured-protocol") }}
