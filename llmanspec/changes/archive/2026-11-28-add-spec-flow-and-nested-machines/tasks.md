# Tasks: add-spec-flow-and-nested-machines

> 验收 Seam：① 纯域 extract / featureSync / diff / sync / validate / forest / 决策表排除（`studio-core` + `validation` 嵌套场景）；② `spec transitions` 自省含 `@flow`/`@states`（`peripheral-commands`）；③ 对本仓全部规格抽取→无改动写回字节级一致。前后对比在 change 分支上相对 merge-base 测量。

- [x] T1 规格级发现与 N1–N5：在 `xstateTransitions.ts` 扩展 tag / 列族 / `TRANSITIONS_INTROSPECTION` / `@flow` 跳过 E4；新增 `validateFlowAndNesting`（占位符、N1–N5、F3/F4 WARNING）并接入 `validateAllSpecs` 与 CLI `specV1Items`；`isDecisionExamplesBlock` 排除 `@states`。单测覆盖跨能力引用、多宿主共享、环、悬空、歧义及 N1–N5 红绿。

- [x] T2 `[blocked-by: T1]` 抽取与写回：`extractStudioMachines` 写入 `graphKind` / `subMachineKey` / `isGateway`；`renderUpdatedFeatureSource` 同步 `@states` 与 `@flow`，无语义改动原样返回；`create` 模式按 IR 写出标签与属性大纲。单测含改名后 `@states` 同步、往返无损（本仓全部规格字节级 + 含 `@states` 夹具改名/增删后再抽取等价）。

- [x] T3 `[blocked-by: T2]` Diff / 同步 / 修订 / 森林 / 检索：`computeMachineDiff` 与摘要增加嵌套链接与网关；`buildSyncItems` 加入 `(state, nest)` / `(state, gateway)`，同签名 `both` 仍 blocked；`acceptRevisionProposal` 保留 `subMachineKey`；`ForestNode` 增加 `maxNestingDepth` / `nestedMachineCount`（不新增跨能力边）；检索索引抽出的嵌套与方言。

- [x] T4 `[blocked-by: T3]` 绑定分支规格与 BDD：`studio-core` 1–2 条规则覆盖往返 / 环 / 悬空 / 同签名冲突；`validation` 覆盖 N1–N5 红绿、`@flow`+`@no-transitions`、F 系列 WARNING；`peripheral-commands` 更新 `spec transitions` 自省。`tests/bdd/steps/` 补步骤。L1 定向单测 → L2 定向 BDD → L3 `validate --check` → L4 收口前 `just qa`。
