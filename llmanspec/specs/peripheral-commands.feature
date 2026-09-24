# language: zh-CN
# capability: peripheral-commands
# purpose: 定义 list/show/graph/spec 助手与 migrate 引导壳的输出合同,验收驱动真实工作区的结构断言。
# scope: packages/core/src/report/, apps/cli/src/commands/list.ts, apps/cli/src/commands/show.ts, apps/cli/src/commands/graph.ts, apps/cli/src/commands/spec.ts, apps/cli/src/commands/project.ts

功能: peripheral-commands

  @req:r20 @human
  场景: list 合同
    - `list --json` MUST 输出 changes 数组,元素字段 MUST 为 name/path/stage/completedTasks/totalTasks/lastModified/idleDays/status;status 枚举 MUST 为 no-tasks(无任务)、complete(全部完成)、in-progress(进行中);`--output human` MUST 以列布局呈现阶段、任务计数、相对时间与 idle 天数;`list` 缺省(无输出 flag)MUST 输出 TOON(IR 与 `--json` 同载荷),并 MUST 支持 `--output <toon|json|compact-json|human>`。

  @req:r20 @executable
  场景: 输出结构合法
    假如 本仓库的真实 llmanspec 工作区
    当 运行 v2 的 list --json 与 graph
    那么 list JSON 元素含 name 与 status 且 status 属于合法枚举
    而且 graph 首行为 flowchart TD

  @req:r20 @executable
  场景: list 遗留 scope 旗标为 unknown option
    假如 本仓库的真实 llmanspec 工作区
    当 运行 list --changes
    那么 报 unknown option 且退出码非零
    而且 list --specs 仍可用

  @req:r21 @human
  场景: show 与 graph 合同
    - `show <change> --output json` 字段集 MUST 覆盖 id/path/title/stage/artifacts/readyToImplement/specsLanded/needsSpecsChange/attached/gateChecks/matchedViaPrefix;`show <spec>` MUST 直出头注释与 gherkin 原文;`graph --format mermaid` MUST 以 `flowchart TD` 开头,节点名 MUST 将 `-` 转为 `_`,archived change MUST 标注 `✓ done` 与 archived class,依赖边 MUST 来自 frontmatter depends_on 且指向 archived 节点时同样保留,报告 MUST 以 classDef archived 行收尾。

  @req:r21 @executable
  场景: show 与 graph 输出契约
    假如 一个含活跃 change 与归档依赖的临时仓库
    当 运行 show --output json 与 show spec 原文与 graph --format mermaid
    那么 show JSON 字段集完整覆盖 change 合同字段
    而且 show spec 直出头注释与 gherkin 原文
    而且 graph 以 flowchart TD 开头且节点下划线化并以 classDef archived 收尾

  @req:r61 @human
  场景: change id 前缀解析
    - `show`、`validate <item>` 与 `change start/attach/diff/finalize/archive` 的 change id 解析 MUST 按 v1 r112 优先级链:exact match 优先于前缀;唯一前缀命中 MUST 解析到该 change,且人读输出 MUST 向 stderr 打 `'input' -> 'resolved' (prefix match)` 提示;多个前缀命中 MUST 报错并列出全部候选,退出码非零;无匹配 MUST 报 change not found;解析 MUST 大小写敏感;JSON 的 matchedViaPrefix MUST 如实上报(exact 为 false,前缀命中为 true);spec id 的精确匹配 MUST 优先于同前缀 change id(不被劫持);共享解析器不含归档兜底(v1 的 archived 回退与 did-you-mean 有意不移植)。`graph` 种子 MUST 支持前缀解析,但走其自有口径:精确 > 活跃唯一前缀 > 归档唯一前缀,多命中/无命中按 graph not found 报错——归档兜底为 graph 特有。

  @req:r61 @executable
  场景: 唯一前缀解析生效
    假如 一个含 c2805-update-todo 与 c2806-fix-bug 两个 change 的临时仓库
    当 运行 show c2805
    那么 解析到 c2805-update-todo 且 stderr 含 prefix match 提示

  @req:r22 @human
  场景: spec 助手与 migrate 引导壳
    - `spec skeleton <cap>` MUST 生成通过单轨校验的骨架(locale 按 config);骨架 MUST NOT 创建仓库根 `src/` 目录,亦 MUST NOT 写入 `# scope: src/` 头注释(`# scope:` 必须指向 capability 真正拥有的文件,缺省预留目录 SHALL 为 `llmanspec/`);`spec next-req-id` MUST 扫描全局 rN 注册表输出下一个空闲 id;`project migrate` MUST 输出 legacy 迁移不随本工具提供的说明且不执行任何迁移。

  @req:r22 @executable
  场景: spec 助手产物与 migrate 三态
    假如 一个已初始化且含 r1 规则的临时仓库
    当 运行 spec skeleton 与 next-req-id 与 project migrate 三态
    那么 skeleton 产物过单轨校验且 next-req-id 输出下一空闲 id
    而且 migrate 裸调用输出总览且两种 kind 各输出协作说明
    而且 未知 --kind 退出码非零

  @req:r22 @executable
  场景: spec skeleton 不产生仓库根 src
    假如 一个已初始化且含 r1 规则的临时仓库
    当 运行 spec skeleton
    那么 骨架通过单轨校验且 # scope: 指向 llmanspec/ 而非 src/
    而且 仓库根无 src/ 目录

  @req:r30 @human
  场景: graph 依赖边解析双风格
    - graph 的 frontmatter depends_on 解析 MUST 同时支持流式(`depends_on: [a, b]`)与块式(`depends_on:` 逐行 `- ` 列表)两种 YAML 风格,两种风格解析出的节点与依赖边集合 MUST 一致;`change new` 生成的空流式 `depends_on: []` MUST 兼容;畸形 frontmatter MUST 按无依赖处理且 MUST NOT 中断 graph 输出。

  @req:r30 @executable
  场景: 流式依赖边被解析
    假如 一个含流式 depends_on 指向已归档 change 的临时工作区
    当 运行 v2 的 graph
    那么 archived 节点被标注 done 且依赖边保留

  @req:r51 @human
  场景: list 排序与紧凑 JSON
    - `list` MUST 支持 `--sort recent|name`(缺省 recent,按 mtime 降序)与 `--compact-json`(单行紧凑 JSON,须与 `--json` 同用)。

  @req:r52 @human
  场景: show 文本输出与 Why/What Changes 门
    - `show <change>` 仅 `--output human` MUST 输出人类可读文本(含 `Stage:`、`path:`、proposal 全文与 `Gates: n/m pass` 尾节),文本模式 MUST NOT 对 `## Why`/`## What Changes` 设门(v1 语义);`show` 缺省(无 --output)MUST 输出 TOON(change/spec IR 与 json 同载荷),并 MUST 支持 `--output <toon|json|compact-json|human>`;`--output compact-json` MUST 输出可 `JSON.parse` 的单行 JSON(不得回落人读文本);`--output json` MUST 按序校验:缺 `## Why` 报 `Change must have a Why section`、缺 `## What Changes` 报 `Change must have a What Changes section`,任一不满足 MUST 退出码非零。

  @req:r53 @human
  场景: show spec 检视与 output 修饰
    - `show <spec>` 文本模式 MUST 忽略 `-r/--requirement`、`--output compact|meta-only|no-scenarios|reqs-only` 而渲染全量源码+Morphology(v1 语义,修饰仅作用于 JSON);`--output json[,meta-only|no-scenarios|reqs-only]` MUST 按 v1 结构输出(items/requirements/scenarios/morphology)。

  @req:r51 @executable
  场景: list 排序与紧凑输出
    假如 一个含多个 change 的临时工作区
    当 运行 list --json --compact-json --sort name
    那么 单行 JSON 输出且顺序为字典序

  @req:r52 @executable
  场景: show 文本与 What Changes 门
    假如 一个缺 What Changes 段的 change 工作区
    当 运行 show
    那么 文本模式不设门且输出 Stage
    当 运行 show --output json
    那么 --output json 受 What Changes 门拦截

  @req:r53 @executable
  场景: spec 检视与 output 修饰
    假如 一个含多条规则的 spec 工作区
    当 运行 show --output human -r 1 与 show --output human,meta-only
    那么 文本模式 -r 与 meta-only 均为全量渲染

  @req:r53 @executable
  场景: show 拒绝已删除的 output token
    假如 一个含活跃 change 的临时仓库
    当 运行 show 该 change --output 且附加已删除的 v1 修饰 token
    那么 报 invalid --output token 且退出码非零

  @req:r54 @human
  场景: graph 范围与深度
    - `graph` MUST 支持 `--scope active|archived|all` 及逗号组合(缺省 active)、`--depth <N>`(种子依赖 BFS 展开层级,缺省 1)与位置参数 `[change]`(种子);archived 节点 MUST 仅在 scope 含 archived 且被活跃依赖引用或种子可达时出现;`--format` MUST 仅接受 `mermaid`(缺省 mermaid),其他值 MUST 报 `unsupported --format: <v> (mermaid only)` 且以退出码 2 退出。

  @req:r55 @human
  场景: spec 助手兼容 flag
    - `spec skeleton` MUST 支持 `--force`(覆盖已存在 .feature,无 force 时已存在 MUST 报错);`spec next-req-id` MUST 支持 `--json`(输出 {reqId})。

  @req:r54 @executable
  场景: scope 与种子子图
    假如 一个含活跃与归档 change 的临时工作区
    当 运行 graph --scope archived
    那么 仅归档节点出现

  @req:r54 @executable
  场景: 非 mermaid 输出格式被拒
    假如 一个含活跃 change 的临时工作区
    当 运行 graph --format json
    那么 报 unsupported --format 且退出码为 2

  @req:r55 @executable
  场景: skeleton force 与 next-req-id json
    假如 一个已存在 spec 的临时工作区
    当 运行 spec skeleton --force 与 spec next-req-id --json
    那么 覆盖成功且 JSON 形状正确

  @req:r58 @human
  场景: proposal 扫描深度全局旋钮
    - sdd 命令面 MUST 提供全局 `--max-scan-depth <N>`(下限 1,缺省 8),约束 `llmanspec/changes/` 下 proposal.md 的递归扫描深度,并对所有扫描 changes/ 的命令(list/show/validate --all/review/graph)统一生效;低于下限 MUST 报错。review 与 graph 在扫描 changes/ 时 MUST 实际读取并遵守该全局值(不得忽略)。

  @req:r58 @executable
  场景: 扫描深度旋钮
    假如 一个嵌套 change 的临时仓库
    当 运行 list --max-scan-depth 1
    那么 嵌套 change 不出现

  @req:r58 @executable
  场景: 深度 1 下 review 与 graph 均不发现深层 change
    假如 一个嵌套 change 的临时仓库且该嵌套位于 2 层深度
    当 运行 review --max-scan-depth 1 与 graph --max-scan-depth 1
    那么 review 信号不含该深层 change 且 graph 输出不含该深层 change 节点
    当 运行 review --max-scan-depth 8 与 graph --max-scan-depth 8
    那么 review 信号含该深层 change 且 graph 输出含该深层 change 节点
