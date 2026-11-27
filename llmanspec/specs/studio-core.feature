# language: zh-CN
# purpose: 定义 Studio 纯域状态机图 IR、可扩展 Linter 校验、语义 Diff、锚定评论与修订建议、本地时间线草稿存储及无损 .feature 渲染契约。

功能: studio-core

  @req:r128
  规则: 状态机图 IR 与双来源提取
    Studio 纯域 MUST 复用 validation 的状态流转发现与列映射逻辑，从 `SpecEntry[]` 提取纳管状态机为带稳定 `uid` 的纯 JSON `StudioMachineIR`，同时支持 `mode: 'modify'`、`mode: 'create'` 与 `mode: 'remove'`；布局坐标 `(x, y)` MUST 独立存于 `layouts` 中，不得混入领域图模型。

    场景: 从 specs 提取纳管状态机并支持从零新建草稿
      假如 一个含中英文状态流转表的 spec 条目集合
      当 调用 Studio 纯域提取状态机并创建从零新建草稿
      那么 提取结果保留原列族与稳定 uid 且新建草稿基线为空

  @req:r129
  规则: 可扩展 Linter 全量图校验
    `validateMachineGraph(machine)` MUST 一次收集全部诊断项而非首错短路，每条诊断携带 `code`、`severity`（`error` 或 `warning`）、精确图元定位及可选 `fixable` 标记；阻断错层严格覆盖 E1 结构完整性、E2 确定性冲突、E3 孤岛不可达与 E4 死锁陷阱，并支持非阻断警告规则（如 W1 守卫缺兜底、W2 草稿占位名）。

    场景: 全量诊断同时报告冲突孤岛死锁与警告
      假如 一张同时包含重复冲突边、孤岛状态与占位命名的状态机图
      当 运行 validateMachineGraph 全量校验
      那么 同时返回 E2 冲突、E3 孤岛与 W2 警告且各自附带精确图元 uid

  @req:r130
  规则: 忽略坐标并识别状态改名的语义 Diff
    `computeMachineDiff(draft)` MUST 仅对比 `baseline` 与 `current` 而忽略布局坐标，按 `uid` 精准区分状态新增、删除与重命名（状态改名不得引爆相连边的假删增），并细粒度标注转移变化的字段；`formatSemanticDiff` MUST 产出简洁的 `+ / - / ~` 人读摘要。

    场景: 重命名状态与调整坐标不产生假边删除
      假如 一份基于基线重命名状态并修改守卫的草稿
      当 计算语义 Diff 与格式化摘要
      那么 仅报告状态改名与守卫修改且无多余边删增

  @req:r131
  规则: 图元锚定评论与不覆盖人类草稿的修订建议层
    评论线程与 Agent 修订建议 MUST 锚定到稳定图元句柄；Agent 提交的 `StudioRevisionProposal`（支持 `rename_state`、`add_state`、`remove_state`、`add_transition`、`remove_transition`、`update_transition`）MUST 仅以 `pending` 状态追加到建议层，经 `previewRevisionProposal` 预演且人类显式调用 `acceptRevisionProposal` 后才原子应用到 `current`。

    场景: Agent 修订建议经预演与显式采纳后才生效
      假如 一份含待审 Agent 修订建议的草稿会话
      当 先预演再显式采纳该修订建议
      那么 采纳前人类草稿零改动且采纳后状态改名与新转移原子生效

  @req:r132
  规则: 本地时间线草稿存储契约与内置样例
    本地草稿会话持久化于 `<instanceRoot>/.llman-sdd/studio/states/<stateId>.json`，经注入式 `StudioStateIo` 以临时文件加原子 `rename` 写盘并做 `zod` 与路径安全校验；文档内置以不可变实际真理为 `BASE` 的 Git 式线性变更时间线（统一撤销、只读观测、回滚与净 Diff 聚合），并内置 2 套全绿演示状态机样例。

    场景: 原子读写本地时间线草稿并校验内置样例全绿
      假如 一个内存态 StudioStateIo 端口夹具
      当 写入草稿、追加时间线快照并回滚至基准同时校验内置样例
      那么 草稿经临时文件原子替换落盘、回滚恢复基准且内置样例零错误

  @req:r133
  规则: 无损更新 .feature 表格、提案草案与内存 Unified Diff 预览
    `renderUpdatedFeatureSource` MUST 按规则与场景语义定位并无损更新目标 `例子:` 表格（在行号偏移后依然精准替换，保留无关注释与缩进，并支持 `create` 新建或追加及 `remove` 下线移除）；`buildProposalDraft` MUST 生成合法 frontmatter 的 `proposal.md`；`previewFeatureUnifiedDiff` MUST 基于 `diff` 库产出内存行级 Unified Diff 预览且不落盘游离 patch 文件。

    场景: 行号偏移后无损写回 .feature 并通过规范校验
      假如 一份在状态机场景上方插入额外规则的 .feature 源码与修改草稿
      当 渲染更新源码、生成 Unified Diff 预览并组装提案草案
      那么 目标例子表精准替换且注释完好、写回源码通过 parseCapability 与 validateCapability

  @req:r149
  规则: 跨语言 Runtime Trace 对账与 @llmanspec: 最小切片提取
    Studio 纯域 MUST 提供 `parseRuntimeTraceJsonl`、`reconcileRuntimeTrace`、`scanLlmanspecAnchors`、`buildDriftSlicePacket` 与 `buildDriftRevisionProposals`（零 I/O、0 Token、100% 离线确定性）。
    JSONL Trace 解析 MUST 经 `zod` 逐行校验，遇到损坏 JSON 或缺少必填字段时 MUST 明确报出行号与错误原因而不静默跳过；对账引擎 MUST 检出 `shadowTransitions`（附出现次数与样例行号）、`uncoveredTransitions` 与 `unknownMachines`，并支持完整 `machineKey` 或无歧义短名匹配。
    `@llmanspec:` 语义锚点扫描 MUST 覆盖 TS/Rust/Python 注释风格（严格匹配 `@llmanspec:<reqId>` 与 `@llmanspec:machine:<machineKey>`），并按 diff hunk 行号交集打包最小切片 `DriftSlicePacket`；`shadowTransitions` 转 `StudioRevisionProposal` MUST 标注 `source: 'drift-trace'` 且保持 `status: 'pending'`。

    场景: Runtime Trace 漂移对账与跨语言 @llmanspec: 最小切片提取
      假如 一份状态机规范、含未登记后门转移与损坏行的 JSONL Trace 及带 @llmanspec: 注释的多语言代码改动
      当 调用纯域解析对账、生成反向建议层与构建最小切片裁决包
      那么 损坏行精确报出行号、后门转移与未覆盖边准确检出且反向建议带 drift-trace 标记
      而且 最小切片仅包含命中 @llmanspec: 锚点的 hunk 与对应规则原文

  @req:r153
  规则: 宏观业务森林纯域投影、交叉桥识别、W3 孤立诊断与 views.json 原子存储
    Studio 纯域 MUST 提供 `buildForestGraph(entries)`（0 Token、零 I/O），将真实 `llmanspec/specs/` 归类为 `machine`/`flow`/`decision`/`doc` 4 类节点并计算权重 `ruleCount + scenarioCount * 0.5 + machineCount * 3`、提取 `tags[]` 与跨能力 `@req:<id>` 自动实线及其 `evidence[]`。
    纯域 MUST 提供 `computeCrossForestBridges(graph, groups)` 识别横跨不同领域分组的自动实线与边界节点，提供 `validateForestIsolation(graph)` 报告 `W3` 孤立规格警告，并提供 `.llman-sdd/studio/views.json` 的 `zod` 契约与原子临时文件读写函数（仅存双向语义视图映射，绝不导出外部双向格式且绝不污染 `llmanspec/specs/`）。

    场景: 纯域森林投影识别四类节点、跨能力证据边、交叉桥与 W3 孤立警告并原子读写 views.json
      假如 包含状态机、决策表、规则文档与孤立规格的 spec 集合及内存态 StudioViewsIo 夹具
      当 运行 buildForestGraph、computeCrossForestBridges、validateForestIsolation 与原子写入 views.json
      那么 节点分类权重与自动实线 evidence 准确提取且交叉桥仅命中跨组契约边
      而且 孤立规格产出 W3 警告且 views.json 经临时文件原子替换校验通过
