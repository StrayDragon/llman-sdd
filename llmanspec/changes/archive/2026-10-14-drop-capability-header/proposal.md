---
depends_on: []
title: 移除 capability 头注释并以全局路径分配 spec id
branch: sdd/drop-capability-header
base_branch: main
base_sha: 2fd7ddd75972d45e04b41005b9e66ef244ac77ea
---

## Why

`# capability:` 与 `功能:` 标题及扁平路径 stem 在本仓长期三者一致，头注释无额外语义且增加 agent 抄写成本。目录式与扁平 spec 可混搭，单靠文件头或单文件文件名无法表达「短 id 与路径 id 消歧」。0.8 已收敛 scope/reviewed-through 头；本 change 继续收缩头契约，并把 spec id 定为 discover 后实例内全局分配的唯一标识。

## What Changes

- **删除 `# capability:` 结构字段**：parser/ir 的 `CapabilityHeader` 仅保留 `purpose`；`# capability:` 存量行按普通注释忽略（不报错），`project migrate strip-legacy-headers` 扩展为同时剥除 `# capability:` 行。
- **spec id 全局分配（r101）**：在单个 `llmanspec/specs/` 实例内扫描全部 `.feature` 后，按偏好 id + 撞名消歧算法分配；扁平与目录式可混搭。
- **`功能:` 门禁**：每个文件的 Gherkin `功能:` 标题 MUST 等于该文件分配后的 spec id（validate ERROR）。
- **终态唯一**：消歧后若两文件仍得相同 spec id → ERROR。
- **`# purpose:` 不变**：仍为必填头注释；元信息区为 `# language:` + `# purpose:`。
- **模板与 skills**：`feature-contract`、skeleton、propose skill 等写明 capability = spec id = `功能:` 名，不再生成 `# capability:`。
- **迁移**：`migrations/v0.8-v0.9/` 升级说明；注册 `0.8.1->0.9.0`（或下一发布）prompt；本仓 specs 自举剥除 capability 头。
- **主动 divergence**：`specIdOf` 不再读头注释；依赖 discover 上下文的分配结果（单文件解析 API 需传入或后接 assign 步骤）。

## Capabilities

- `spec-parsing` — r8 头契约收缩、r101 spec id 分配
- `validation` — r12 规则域改写（purpose/功能标题/重复 spec id）
- `spec-authoring` — 写目标按分配后的 spec id 精确命中
- `peripheral-commands` — skeleton 头、r100 strip 扩展
- `init-generators` — 模板与 feature-contract 文案

## Impact

- 破坏性：下游若手写 `# capability:` 且与路径不一致，升级后以路径分配为准；须 `strip-legacy-headers` + 对齐 `功能:` 行。
- 行为收益：少一行重复元数据；混搭布局下 id 可预测消歧。
- 实现：`discoverSpecs` 后 `assignSpecIds`；全仓消费方改读分配 id。

## Open Questions

- 无（探索阶段已确认撞名时全部采用 `rel` 无后缀作 id）。
