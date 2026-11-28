---
depends_on: []
title: 规格声明流程图方言与任意深度子机嵌套
branch: sdd/add-spec-flow-and-nested-machines
base_branch: main
base_sha: 5f62e3ddf84cf3d9f132a7501c1a1128e3abbd50
---

# 规格声明流程图方言与任意深度子机嵌套

## Why

Studio IR 已有 `graphKind` / `isGateway` / `subMachineKey`，Web UI 也已消费（下钻、流程图 F1–F4），但抽取只产出 states/transitions，写回只重写转移表。往返会丢失 flow 方言与嵌套；diff / sync / 规格校验 / 森林投影看不见它们。规格本身必须能声明这些语义，并让纯域全链路看见，否则画布上的嵌套与网关无法成为可校验的行为合约。

## What Changes

- 转移大纲可挂 `@flow`：抽取为 `graphKind:'flow'`；规格校验施 E1/E2/E3 与 F3/F4 WARNING，不施 E4；与 `@no-transitions` 同挂判 ERROR。
- 同规则内 `@states` 大纲用状态属性表声明子机引用与网关；引用经全局 req 注册表解析（`@req:id` 或 `@req:id#场景名`），允许多宿主共享，禁止环，不设深度上限。
- `@states` 大纲永不被当成转移表或决策表；抽取把解析结果写入既有 IR 字段（不新增字段）。
- 写回同步 `@states` 表与 `@flow` 标签；无语义改动时字节级原样返回。
- Diff / 同步看见嵌套链接与网关变更；同签名冲突仍禁止「两条都留」。森林节点增加最大嵌套深度与子机数，不新增跨能力边。
- `spec transitions` 自省（`TRANSITIONS_INTROSPECTION`）补充 `@flow` / `@states`。

## Capabilities

- `studio-core`：嵌套与方言的抽取 / 写回 / diff / 同步 / 森林投影。
- `validation`：`@flow` / `@states` 门禁与 N1–N5。
- `peripheral-commands`：`spec transitions` 自省输出跟随单一真源。

## Impact

- 不改 `apps/studio`、不加 CLI 新命令、不迁移真实规格内容、不引入 Mermaid/visimer、不加 MCP 工具、不加深度上限。
- `--demo` 仍仅在抽不出任何机器时注入演示子机；不删 `demos.ts`。
- `RevisionOp` 不新增；`acceptRevisionProposal` 不得破坏既有 `subMachineKey`。
