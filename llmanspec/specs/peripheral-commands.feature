# language: zh-CN
# purpose: 定义 list/show/graph/spec 助手与 migrate 引导壳的输出合同,验收驱动真实工作区的结构断言。

功能: peripheral-commands

  @req:r20
  规则: list 合同
    `list --json` MUST 输出 changes 数组,元素字段 MUST 为
    name/path/stage/completedTasks/totalTasks/lastModified/idleDays/status;status 枚举 MUST 为
    no-tasks(无任务)、complete(全部完成)、in-progress(进行中);`--output human` MUST 以列布局呈现阶段、任务计数、相对时间与 idle
    天数;`list` 缺省(无输出 flag)MUST 输出 TOON(IR 与 `--json` 同载荷),并 MUST 支持
    `--output <toon|json|compact-json|human>`;元素 `title` MUST 与 `show` 同源同口径(见 r21)。

    场景: 输出结构合法
      假如 本仓库的真实 llmanspec 工作区
      当 运行 list --json 与 graph
      那么 list JSON 元素含 name 与 status 且 status 属于合法枚举
      而且 graph 首行为 flowchart TD


    场景: list 遗留 scope 旗标为 unknown option
      假如 本仓库的真实 llmanspec 工作区
      当 运行 list --changes
      那么 报 unknown option 且退出码非零
      而且 list --specs 仍可用

  @req:r21
  规则: show 与 graph 合同
    `show <change> --output json` 字段集 MUST 覆盖
    id/path/title/stage/artifacts/readyToImplement/specsLanded/needsSpecsChange/attached/gateChecks/matchedViaPrefix;`show <spec>`
    MUST 直出头注释与 gherkin 原文;`graph --format mermaid` MUST 以 `flowchart TD` 开头,节点名 MUST 将 `-` 转为
    `_`,archived change MUST 标注 `✓ done` 与 archived class,依赖边 MUST 来自 frontmatter depends_on 且指向
    archived 节点时同样保留,报告 MUST 以 classDef archived 行收尾。`show` 与 `list` 元素的 `title` MUST 取 proposal
    frontmatter `title`(非空时优先),否则回退 proposal 正文 H1(与 review-freeze r24 冻结卡同口径)。

    场景: show 与 graph 输出契约
      假如 一个含活跃 change 与归档依赖的临时仓库
      当 运行 show --output json 与 show spec 原文与 graph --format mermaid
      那么 show JSON 字段集完整覆盖 change 合同字段
      而且 show spec 直出头注释与 gherkin 原文
      而且 graph 以 flowchart TD 开头且节点下划线化并以 classDef archived 收尾

  @req:r61
  规则: change id 前缀解析
    `show`、`validate <item>` 与 `change start/attach/diff/finalize/archive` 的 change id 解析 MUST 按前代 r112
    优先级链:exact match 优先于前缀;唯一前缀命中 MUST 解析到该 change,且人读输出 MUST 向 stderr 打
    `'input' -> 'resolved' (prefix match)` 提示;多个前缀命中 MUST 报错并列出全部候选,退出码非零;无匹配 MUST 报 change not
    found;解析 MUST 大小写敏感;JSON 的 matchedViaPrefix MUST 如实上报(exact 为 false,前缀命中为 true);spec id 的精确匹配 MUST
    优先于同前缀 change id(不被劫持);共享解析器不含归档兜底(前代的 archived 回退与 did-you-mean 有意不移植)。`graph` 种子 MUST
    支持前缀解析,但走其自有口径:精确 > 活跃唯一前缀 > 归档唯一前缀,多命中/无命中按 graph not found 报错——归档兜底为 graph 特有。

    场景: 唯一前缀解析生效
      假如 一个含 c2805-update-todo 与 c2806-fix-bug 两个 change 的临时仓库
      当 运行 show c2805
      那么 解析到 c2805-update-todo 且 stderr 含 prefix match 提示

  @req:r22
  规则: spec 助手与 migrate 引导壳
    `spec skeleton <cap>` MUST 生成通过单轨校验的骨架(locale 按 config);骨架 MUST NOT 创建仓库根 `src/` 目录,且 MUST NOT 写入
    `# scope:` 或 `# capability:` 头注释(头部仅 `# language:`/`# purpose:`);`spec next-req-id` MUST 扫描全局 rN 注册表输出最大已用号加一(空注册表输出 r1)且 MUST NOT 复用树内已
    退役的空缺号段(`spec skeleton` 取号共用同一语义;数字 id 分发统一为 max+1 单点分配器原语,分发与 already-in-use 检验
    MUST 同源且 MUST 零持久化状态(不写计数器/tombstone/缓存文件,重扫描即真相),`project dedupe-req-ids` 重映射与
    change_id.template 的 llman_sdd_unique_id 同受此约束;本条取代「与前代
    smallest free 有意分叉、不得合并」旧红线,退役号不复用的理由继承 issue #5 与 align-next-req-id-max-plus-one 的 design);`project migrate` 的 `--kind` legacy 协作说明 MUST 保持输出且该路径不执行任何迁移;迁移总览、playbook 与 strip 子命令见 peripheral-commands r100。

    场景: spec 助手产物与 migrate 三态
      假如 一个已初始化且含 r1 规则的临时仓库
      当 运行 spec skeleton 与 next-req-id 与 project migrate 三态
      那么 skeleton 产物过单轨校验且 next-req-id 输出最大已用号加一
      而且 migrate 裸调用输出总览且两种 kind 各输出协作说明
      而且 未知 --kind 退出码非零

    场景: 空缺号段不被复用
      假如 一个已初始化且含 r1 与 r5 规则的临时仓库
      当 运行 spec next-req-id
      那么 输出 r6 而非复用空缺号 r2


    场景: spec skeleton 不产生仓库根 src
      假如 一个已初始化且含 r1 规则的临时仓库
      当 运行 spec skeleton
      那么 骨架通过单轨校验且头部无 # scope: 行
      而且 仓库根无 src/ 目录

  @req:r30
  规则: graph 依赖边解析双风格
    graph 的 frontmatter depends_on 解析 MUST 同时支持流式(`depends_on: [a, b]`)与块式(`depends_on:` 逐行 `- ` 列表)两种
    YAML 风格,两种风格解析出的节点与依赖边集合 MUST 一致;`change new` 生成的空流式 `depends_on: []` MUST 兼容;畸形 frontmatter MUST
    按无依赖处理且 MUST NOT 中断 graph 输出。

    场景: 流式依赖边被解析
      假如 一个含流式 depends_on 指向已归档 change 的临时工作区
      当 运行 graph
      那么 archived 节点被标注 done 且依赖边保留


    场景: 块式依赖与畸形 frontmatter 不中断
      假如 一个含块式 depends_on 与畸形 frontmatter 的临时工作区
      当 运行 graph
      那么 块式依赖边被解析且畸形条目不中断输出

  @req:r51
  规则: list 排序与紧凑 JSON
    `list` MUST 支持 `--sort recent|name`(缺省 recent,按 mtime 降序)与 `--compact-json`(单行紧凑 JSON,须与 `--json`
    同用)。

    场景: list 排序与紧凑输出
      假如 一个含多个 change 的临时工作区
      当 运行 list --json --compact-json --sort name
      那么 单行 JSON 输出且顺序为字典序

  @req:r52
  规则: show 文本输出与 Why/What Changes 门
    `show <change>` 仅 `--output human` MUST 输出人类可读文本(含 `Stage:`、`path:`、proposal 全文与 `Gates: n/m pass`
    尾节),文本模式 MUST NOT 对 `## Why`/`## What Changes` 设门(前代语义);`show` 缺省(无 --output)MUST 输出
    TOON(change/spec IR 与 json 同载荷),并 MUST 支持
    `--output <toon|json|compact-json|human>`;`--output compact-json` MUST 输出可 `JSON.parse` 的单行
    JSON(不得回落人读文本);`--output json` MUST 按序校验:缺 `## Why` 报 `Change must have a Why section`、缺
    `## What Changes` 报 `Change must have a What Changes section`,任一不满足 MUST 退出码非零。

    场景: show 文本与 What Changes 门
      假如 一个缺 What Changes 段的 change 工作区
      当 运行 show
      那么 文本模式不设门且输出 Stage
      当 运行 show --output json
      那么 --output json 受 What Changes 门拦截

  @req:r53
  规则: show spec 检视与 output 修饰
    `show <spec>` 文本模式 MUST 忽略 `-r/--requirement`、`--output compact|meta-only|no-scenarios|reqs-only`
    而渲染全量源码+Morphology(前代语义,修饰仅作用于 JSON);`--output json[,meta-only|no-scenarios|reqs-only]` MUST
    按前代结构输出(items/requirements/scenarios/morphology)。

    场景: spec 检视与 output 修饰
      假如 一个含多条规则的 spec 工作区
      当 运行 show --output human -r 1 与 show --output human,meta-only
      那么 文本模式 -r 与 meta-only 均为全量渲染


    场景: show 拒绝已删除的 output token
      假如 一个含活跃 change 的临时仓库
      当 运行 show 该 change --output 且附加已删除的前代修饰 token
      那么 报 invalid --output token 且退出码非零

  @req:r54
  规则: graph 范围与深度
    `graph` MUST 支持 `--scope active|archived|all` 及逗号组合(缺省 active)、`--depth <N>`(缺省 1)与位置参数
    `[change]`(种子);archived 节点 MUST 仅在 scope 含 archived 且被活跃依赖引用或种子可达时出现;`--format` MUST 仅接受
    `mermaid`(缺省 mermaid),其他值 MUST 报 `unsupported --format: <v> (mermaid only)` 且以退出码 2 退出。
    `--depth` MUST 同时约束种子与无种子全图模式:无种子时以 scope 内节点为根,`--depth 0` MUST 仅输出 scope 内节点(不拉入依赖
    target),`--depth 1`(缺省)MUST 输出 scope 内节点及其直接依赖 target,`--depth N(≥2)` MUST 沿 depends_on 递归展开 N
    层;种子模式 MUST 保持既有的依赖+反向 BFS 展开语义(缺省 1);`--depth` 不得在任一模式被静默忽略。
    冻结平铺卡 `changes/archive/<YYYY-MM-DD>-<id>.yaml` MUST 被识别为 archived 节点(与归档目录同语义,标注 done 与 archived
    class);卡内 `depends_on` MUST 参与依赖边解析,读取 MUST 兼容单文档纯 YAML 卡(review-freeze r24 新格式)与 `---`
    围栏卡(存量格式,不迁移),使冻结 change 的依赖链在 `--scope archived` 与
    `--scope all` 下可展示;平铺卡 id 拆解(`<date>-<id>`、去 `.yaml` 后缀)与归档目录口径一致。

    场景: scope 与种子子图
      假如 一个含活跃与归档 change 的临时工作区
      当 运行 graph --scope archived
      那么 仅归档节点出现


    场景: 冻结平铺卡节点与依赖链
      假如 一个含纯 YAML 平铺冻结卡且卡内 depends_on 指向另一冻结卡的临时工作区
      当 运行 graph --scope archived
      那么 冻结卡节点被标注 done 且依赖边保留


    场景: 非 mermaid 输出格式被拒
      假如 一个含活跃 change 的临时工作区
      当 运行 graph --format json
      那么 报 unsupported --format 且退出码为 2


    场景: 全图模式受 --depth 约束
      假如 一个含活跃 change A 依赖 change B、B 依赖 change C 的临时工作区
      当 运行 graph --depth 0
      那么 节点集为活跃 scope 内节点且不含依赖 target
      当 运行 graph --depth 1 与 graph 缺省
      那么 两层输出节点集一致且含直接依赖 target、不含二级依赖
      当 运行 graph --depth 2
      那么 节点集含二级依赖且超出一层范围


    场景: 存量围栏卡依赖链兼容
      假如 一个含 --- 围栏式存量冻结卡且卡内 depends_on 指向另一冻结卡的临时工作区
      当 运行 graph --scope archived
      那么 围栏卡节点依赖边保留

  @req:r55
  规则: spec 助手兼容 flag
    `spec skeleton` MUST 支持 `--force`(覆盖已存在 .feature,无 force 时已存在 MUST 报错);`spec next-req-id` MUST 支持
    `--json`(输出 {reqId})。

    场景: skeleton force 与 next-req-id json
      假如 一个已存在 spec 的临时工作区
      当 运行 spec skeleton --force 与 spec next-req-id --json
      那么 覆盖成功且 JSON 形状正确

  @req:r58
  规则: proposal 扫描深度全局旋钮
    sdd 命令面 MUST 提供全局 `--max-scan-depth <N>`(下限 1,缺省 8),约束 `llmanspec/changes/` 下 proposal.md
    的递归扫描深度,并对所有扫描 changes/ 的命令(list/show/validate --all/review/graph)统一生效;低于下限 MUST 报错。review 与 graph
    在扫描 changes/ 时 MUST 实际读取并遵守该全局值(不得忽略)。

    场景: 扫描深度旋钮
      假如 一个嵌套 change 的临时仓库
      当 运行 list --max-scan-depth 1
      那么 嵌套 change 不出现


    场景: 深度 1 下 review 与 graph 均不发现深层 change
      假如 一个嵌套 change 的临时仓库且该嵌套位于 2 层深度
      当 运行 review --max-scan-depth 1 与 graph --max-scan-depth 1
      那么 review 信号不含该深层 change 且 graph 输出不含该深层 change 节点
      当 运行 review --max-scan-depth 8 与 graph --max-scan-depth 8
      那么 review 信号含该深层 change 且 graph 输出含该深层 change 节点
  @req:r89
  规则: spec unbound 未绑定需求检索
    `spec unbound [--limit N]` MUST 输出未绑定需求(无 runnable 嵌套场景的规则,与 review unbound 信号、validate 聚合 INFO 同口径),缺省 --limit 1,`--limit 0` 输出全部,`--limit N` 输出前 N 条;排序 MUST 确定性(按 capability 文件扫描序与文件内规则出现序)。limit 语义对缺省 TOON/--output human/json/compact-json 所有输出模式 MUST 一致生效。每条 MUST 含 requirement 句柄、标题、描述、capability id 与 capability 主文件的仓库根相对路径;输出 MUST 含 total/returned/remaining 与提示字段(提示引导 `--limit 0` 列出全部);非数字或负数的 `--limit` 值 MUST 以退出码 2 报 usage 错误;无未绑定需求时 MUST 输出 total 为 0 且退出码为 0。

    场景: 缺省返回一条并提示剩余
      假如 一个含未绑定需求的临时 specs 目录
      当 运行 spec unbound
      那么 unbound 输出含 "returned: 1"
      而且 unbound 输出含 "remaining: 2"
      而且 unbound 输出含 "用 --limit 0 列出全部"
      而且 退出码为 0


    场景: --limit 0 返回全部且排序确定
      假如 一个含未绑定需求的临时 specs 目录
      当 运行 spec unbound --limit 0 --json
      那么 unbound JSON 的 total 为 3 且 requirements 为 3 条
      而且 unbound JSON 的 reqId 序列恰为 "r2,r3,r4"
      而且 退出码为 0


    场景: human 输出给出剩余数与提示
      假如 一个含未绑定需求的临时 specs 目录
      当 运行 spec unbound --output human
      那么 unbound 输出含 "1 shown of 3 total"
      而且 unbound 输出含 "用 --limit 0 列出全部"
      而且 退出码为 0


    场景: 全 @skip 场景的规则计入未绑定
      假如 一个含未绑定需求的临时 specs 目录
      当 运行 spec unbound --limit 0 --json
      那么 unbound JSON 的 reqId 序列恰为 "r2,r3,r4"
      而且 退出码为 0


    场景: 无未绑定需求时 total 为 0
      假如 一个全部绑定需求的临时 specs 目录
      当 运行 spec unbound --limit 0 --json
      那么 unbound JSON 的 remaining 与 hint 为空且 total 为 0
      而且 退出码为 0
  @req:r90
  规则: 绑定计量字段与术语口径
    `list --specs` 与 `show <spec> --json` 的 morphology 计量字段 MUST 以 requirement 系命名:`requirementBoundCount`(有至少一个 runnable 嵌套场景的规则数)与 `requirementUnboundCount`(无 runnable 嵌套场景的规则数);「未绑定」全局唯一定义为无 runnable 嵌套场景(0 场景或嵌套场景全部带 @skip/@experimental),与 review unbound 信号、validate 聚合 INFO、spec unbound 检索 MUST 同口径;历史字段名 ruleEnforcedCount/rulePendingCount MUST 不再产出(human 形态词汇随之人读口径收敛)。

    场景: morphology 计量字段命名对账
      假如 工作目录是仓库根
      当 执行命令 "bun tests/bdd/assert/morphology-names.ts"
      那么 退出码为 0
  @req:r94
  规则: spec 助手注册表按根
    spec 助手的 rN 注册表(next-req-id/add-req/skeleton/resolve-req)MUST 以当前实例根(cwd 或 --directory 解析)为扫描根,各根注册表独立、跨根不保证唯一;max+1 取号语义不变。

    场景: 子根取号只扫子根注册表
      假如 一个子根含 r5 规则的临时仓库
      当 运行 spec next-req-id 于子根
      那么 输出 r6 而非根部空缺号

  @req:r100
  规则: project migrate 按版本组织的迁移手册与存量头剥离
    迁移注册表 MUST 按单版本组织(每版本声明自己的迁移条目,条目含标题、逐步命令与自检清单),`project migrate` 裸调用 MUST 在既有总览之上追加已知迁移版本清单(含获取方式提示);
    `project migrate prompt --from-version <v> --to-version <v>` MUST 输出面向 agent 的英文迁移手册:按 `(from, to]` 左开右闭的数值比较聚合范围内全部已登记版本并升序输出,逐版本 `## <version>` 头,版本内逐条目标题、编号步骤与逐项自检清单,版本间以水平分割线分隔,同一范围的输出 MUST 逐字节确定;
    版本 MUST 为 `x.y.z` 三段数字,非法格式或 `from >= to` MUST 报错;范围合法但无登记条目 MUST 输出无登记迁移提示且退出码为 0;
    `--version-expr` 为废弃旗标:继续解析并等价映射为新旗标语义,MUST 向 stderr 输出弃用 WARNING 指引新旗标,与新旗标同给 MUST 报冲突错;
    `--from-version`、`--to-version`、`--kind` 或 `--version-expr` 任一出现而无 `action` 时 MUST 报用法错误(退出码 2)并列出合法
    `action`(prompt、strip-legacy-headers),MUST NOT 静默忽略该旗标;
    `project migrate strip-legacy-headers` MUST 扫描当前实例根 `llmanspec/specs/**` 全部 .feature,删除行首 `# scope:`、`# reviewed-through:` 或 `# capability:` 的注释行(全文范围,幂等:无匹配则零改动),`--dry-run` MUST 仅报告将改动的文件与行数而不写盘,执行结束 MUST 输出后续清单(重跑 `init --update`)与改动统计,剥除后产物 MUST 通过结构校验。

    场景: 迁移手册按版本范围聚合输出
      假如 一个已安装本 CLI 的临时仓库
      当 运行 project migrate prompt --from-version 0.7.5 --to-version 0.9.0
      那么 输出依次含 0.8.0 与 0.9.0 版本头及各条目的编号步骤与自检清单
      而且 版本间以水平分割线分隔

    场景: 范围左开右闭排除下界版本
      假如 一个已安装本 CLI 的临时仓库
      当 运行 project migrate prompt --from-version 0.8.0 --to-version 0.9.0
      那么 输出含 0.9.0 版本头且不含治理元数据退役条目

    场景: 空范围输出无迁移提示
      假如 一个已安装本 CLI 的临时仓库
      当 运行 project migrate prompt --from-version 0.8.0 --to-version 0.8.2
      那么 输出含无登记迁移提示且退出码为 0

    场景: 非法版本与逆序范围报错
      假如 一个已安装本 CLI 的临时仓库
      当 运行 prompt 携带非法版本格式与携带 from 大于 to 两例
      那么 均报错且非法格式例的错误信息含 x.y.z 格式提示

    场景: 废弃旗标可用但告警且与新旗标冲突报错
      假如 一个已安装本 CLI 的临时仓库
      当 运行 project migrate prompt --version-expr "0.7.5->0.8.0" 与其再同给 --from-version 0.7.5 一例
      那么 前者输出 0.8.0 迁移手册且 stderr 含弃用 WARNING
      而且 后者报旗标冲突错

    场景: 剥除历史头行且幂等
      假如 一个 specs 含 # scope: 与 # reviewed-through: 与 # capability: 头行的临时仓库
      当 运行 project migrate strip-legacy-headers 后再次运行
      那么 首次运行后三类头行不再出现且文件仍通过结构校验
      而且 第二次运行报告零改动

    场景: dry-run 只报告不写盘
      假如 一个 specs 含历史头行的临时仓库
      当 运行 project migrate strip-legacy-headers --dry-run
      那么 报告含将改动的文件且文件内容不变
  @req:r105
  规则: spec transitions 只读内省输出契约
    llman-sdd spec transitions MUST 为零参数只读子命令:输出状态流转校验的判定细节,内容 MUST 含特征词列别名族(from/初始状态、event/事件、to/目标状态)、无 tag 时的嗅探判据(三族至少两族)、@transitions/@no-transitions 双向覆盖语义与 1-4 道门禁清单;内容常量 MUST 由 core 单一事实源导出,输出为人读格式。


    场景: spec-transitions-introspection
      假如 一个可用的工作区
      当 运行 spec transitions
      那么 退出码为 0 且输出含特征词别名族、@transitions 与 @no-transitions 及四道门禁标识