---
depends_on: []
---

# 移除未实现的 PromptDriver 死端口并回调 core 纯域纪律交互条款

## Why

`packages/core/src/ports.ts` 声明了 `PromptDriver`（select/multiselect/confirm）交互端口，但全代码库零实现、零引用：唯一的交互路径是 `apps/cli/src/commands/spec.ts` 的 `spec migrate-native` 确认提示，直接以 `node:readline` 实现于 CLI 适配层，从未经过该端口。这是与项目"无 stub、无死表面"精神相悖的死代码，且 `monorepo-structure.feature` r3 契约（"交互提示 MUST 收敛在 PromptDriver 接口之后"）描述的是一个不存在的接口。经探索核验：`tests/` 下无任何断言引用 PromptDriver，删除它不会碰红任何门禁——该条款当前只有道德约束力。未来若引入 `@inquirer/prompts` 向导或 ink TUI（AGENTS.md 战略方向），另行建端口即可，无需保留今天的空壳。

## What Changes

- `packages/core/src/ports.ts`：删除 `PromptDriver` 接口（select/multiselect/confirm 及其注释）。core 目前无任何交互提示，端口移除后 `ports.ts` 只余副作用注入端口。
- `apps/cli/src/commands/spec.ts`：`confirmInteractive` 保持现状——它位于 CLI 适配层（`node:readline` 直连），不构成 core 纯度违约；本变更不迁移它。
- `llmanspec/specs/monorepo-structure.feature` r3：将"交互提示 MUST 收敛在 PromptDriver 接口之后"回调为诚实条款——交互提示 MUST 收敛于 CLI 适配层，core 域逻辑不得发起终端交互（当前唯一交互在 `spec migrate-native` 确认，位于 CLI 层）。
- `llmanspec/AGENTS.md`：依赖映射与交互方向两条措辞移除 "PromptDriver 端口" 引用；`@inquirer/prompts` 与 ink TUI 作为未来交互方向保留（二者禁止同进程混用不变）。
