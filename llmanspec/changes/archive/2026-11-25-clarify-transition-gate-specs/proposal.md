---
depends_on: []
title: 把状态流转门禁写成可读规则，stage 改为文件组合推断
branch: sdd/clarify-transition-gate-specs
base_branch: main
base_sha: 745d9ea9f0af612e93613f81182dcbef0cc6c083
---

# 状态流转门禁与 stage 推断对齐实现

## Why

`validation` 的 `@req:r104` 把 tag 发现和四道门禁写在同一段里，BDD 再用三条合并断言覆盖。中文列名、守卫列、空单元格、不足两个状态、自环吸收态已经在实现里，规格上没有单独例子。`change-lifecycle` 的 `@req:r34` 用 `from/event/to` 事件表描述 stage，实现却是 `stageFor(hasDesign, hasTasks, hasBinding)` 的文件存在性推断。校验图由 `@statelyai/graph` 遍历，`createMachine` 的失败被空 catch 吃掉，不参与判定。

## What Changes

- **validation**：`@req:r104` 只保留场景级 tag 定界。结构与占位符、确定性、可达、终态/回初态各成一条短规则，每条场景只断言一个结果。补上中文列名、守卫列、空单元格、单状态、重复行与自环吸收态的例子。对外 ERROR 文案与退出码不变。
- **change-lifecycle**：`@req:r34` 的场景大纲改为设计文件、任务文件、分支绑定三者到 stage 的例子表，不再使用事件名。分支绑定指 proposal frontmatter 同时具有 `branch`、`base_branch`、`base_sha`。
- **实现**：删掉不参与判定的 `createMachine` 调用和未使用的 `parseTransitionExpr`，去掉对 `xstate` 的直接依赖。图遍历仍用 `@statelyai/graph`。模块文件名保持 `xstateTransitions.ts`。

## Capabilities

- `validation`（重写 `@req:r104`；新增结构、确定性、可达、终态四条规则）
- `change-lifecycle`（重写 `@req:r34` 的阶段例子，使例子表与 `stageFor` 一致）

## Impact

- 校验结果的 ERROR 文案与非零退出码保持不变。`spec transitions` 的内省常量不改。
- `packages/core` 不再直接依赖 `xstate`。
- 无命令面、无配置键、无迁移文档。存量 `@transitions` / `@no-transitions` 写法不变。
