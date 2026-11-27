# language: zh-CN
# purpose: 定义 specs 校验引擎的判定规则域、报告行格式与 BDD 检查退出码语义。

功能: validation

  @req:r11
  规则: 判定聚合与报告行格式
    校验 MUST 按 capability 聚合判定:任一 ERROR 即 `FAIL spec/<capability>`,否则 `OK spec/<capability>`;报告 MUST 以
    `Totals: N passed, M failed (K items)` 收尾;存在 FAIL 时进程退出码 MUST 非零。

    场景: 报告行聚合与退出码
      假如 一个含种子缺陷 spec 的临时仓库
      当 在该仓库运行 validate --specs --output human
      那么 stdout 符合正则 "FAIL spec/[a-z-]+"
      而且 stdout 符合正则 "OK spec/"
      而且 stdout 符合正则 "Totals: \d+ passed, \d+ failed \(\d+ items\)"
      而且 退出码为 1

  @req:r12
  规则: 规则域(种子缺陷判定)
    缺或空 `# purpose:` 头注释 MUST 判 ERROR;分配后的 spec id 与 `功能:` 标题不一致 MUST 判 ERROR;分配完成后重复的 spec id MUST 判 ERROR;每条 `规则:` MUST 携带全局唯一的 @req:<id> 句柄(缺失或重复——同一文件内多条规则
    共用或跨 capability——MUST 判 ERROR);不含任何 `规则:` 的 capability MUST 判 ERROR;顶层 `场景:`(Gherkin 功能级示例,无规则句柄)不告警、不参与规则统计;无 runnable
    嵌套场景的 `规则:`(0 场景或嵌套场景全部带 @skip/@experimental)MUST 输出聚合计数 INFO(按 capability 一条,不逐条爆炸,`--include-info` 可见);规则描述为自由文本
    (MUST/SHALL 词不强制);历史标签 `@human/@rule/@executable/@manual` 解析惰性、不再承载语义,且不再提供迁移命令。全局重复 req_id(同文件内或跨文件,按携带该 id 的规则条数 > 1 判定)MUST 对每个涉事 capability 判 ERROR;
    spec id 的分配(前缀剥除)MUST 路径形态无关:同一 .feature 文件无论以绝对或相对路径装载,分配的 spec id 一致
    (specs 树内相对位置命名),调用方以绝对路径装载时 MUST NOT 退化出全路径 id。

    场景: 种子缺陷被判 FAIL
      假如 一个含缺 @req 与重复 req_id 缺陷的 specs 目录
      当 运行 specs 校验
      那么 FAIL 集合恰为缺 @req 与重复 req_id 涉事的 capability
      而且 退出码非零

    场景: 同文件内重复 req_id 判 ERROR
      假如 一个单 capability 文件内两条规则挂同一 @req 的 specs 目录
      当 运行 specs 校验
      那么 FAIL 集合恰为该 capability
      而且 退出码非零


    场景: 种子缺陷逐类判定
      假如 一个每类种子缺陷各占一个 capability 的临时仓库
      当 运行 validate --specs --json
      那么 缺 purpose 头、功能标题与 spec id 不一致、缺 @req、重复 req_id 与零规则 capability 各 capability 均 valid 为 false 且各含对应 ERROR
      而且 退出码非零

    场景: 绝对路径装载的 id 推导与标题匹配
      假如 一个标题与基名一致的合法 specs 目录
      当 以绝对根路径装载各 .feature 并运行 specs 校验
      那么 各 capability 均 valid 为 true 且无 spec id 失配 ERROR

  @req:r63
  规则: validate 完整性 WARNING(已绑定 change)
    stage=full 的已绑定 change 若 live specs 未 landed 且 `needs_specs_change` 不为 false,MUST 报带 skill 引导的
    WARNING(path `proposal.md`):指引在绑定分支编辑并提交 live specs(llman-sdd-propose)、MUST NOT 建议对已 attach 的
    change 重跑 change start、实施入门 MUST 表述为 `llman-sdd show <id>` 的 specs-landed 门通过(llman-sdd-apply),MUST
    NOT 以 readyToImplement=true 作为 apply 入门条件(readyToImplement 是 verify/finalize 的完成信号);默认分支上存在
    `llmanspec/specs/` 未提交脏改动时,validate MUST 报 WARNING 指引切到绑定分支再编辑(工作区级,每次调用至多一次);两条 WARNING
    缺省不阻断,`--strict` 按既有升级语义处理。

    场景: 完整性 WARNING 与脏 specs 警告
      假如 一个 stage=full 已绑定但 specs 未 landed 的临时仓库
      当 对该 change 运行 validate --json
      那么 输出含 specs not landed WARNING 且带 llman-sdd-propose 引导
      而且 不建议重跑 change start
      而且 引导以 specs-landed 门为 apply 入门且不含 "readyToImplement=true"
      当 切回默认分支并弄脏 llmanspec/specs 后再次运行 validate
      那么 输出含工作区级脏 specs WARNING


    场景: 完整性 WARNING 在 strict 下升级
      假如 一个 stage=full 已绑定但 specs 未 landed 的临时仓库
      当 对该 change 运行 validate --json --strict
      那么 specs not landed 条目级别为 ERROR 且退出码非零

  @req:r64
  规则: proposal frontmatter 合法字段集
    proposal frontmatter 合法字段 MUST 为 depends_on/blocks/branch/base_branch/base_sha/needs_specs_change/title
    七个;合法集外字段(如 status/priority/author)MUST 报 ERROR 且错误消息 MUST 列出该字段名与合法字段集;title 的必填与占位约束见 @req:r99;`changes/archive/` 下的
    proposal MUST 免检;stage MUST 由磁盘工件与绑定实时推断,MUST NOT 引入任何 frontmatter 字段影响 stage。

    场景: frontmatter 非法字段被拒
      假如 一个 proposal frontmatter 含未知字段 "status" 的临时仓库
      当 对该 change 运行 validate --output human
      那么 输出含未知字段 "status" 与合法字段集提示
      当 把 frontmatter 改写为七个合法字段后再次运行 validate
      那么 退出码为 0


    场景: 归档 proposal 免检
      假如 一个 changes/archive 下 proposal 含未知字段 "status" 的临时仓库
      当 运行 validate --changes --json
      那么 输出不含 unknown field 相关 issue

  @req:r32
  规则: INFO 级 issue 缺省过滤
    `validate` 的 issues 输出(文本与 `--json` 同口径)缺省 MUST 仅含 WARNING 及以上级别,INFO 级 issue(如 pending 规则提示)MUST
    NOT 出现;`--include-info` MUST 恢复完整 issues;级别过滤 MUST NOT 影响 valid 判定、summary 计数口径与退出码。

    场景: INFO 过滤与恢复
      假如 一个含 pending 规则的有效 spec 工作区
      当 运行 validate --all --json 与 validate --all --json --include-info
      那么 缺省输出不含 INFO 级 issue 且 include-info 输出含 INFO 级 issue
      而且 两次运行的 valid 判定与退出码一致

  @req:r13
  规则: spec 验证命令执行与 check 旗标
    配置了非空 `specs.check_command`(含经旧 `bdd.check_command` 兼容提升的等价配置)时,`validate` 的目标集含 spec 即 MUST 缺省跳过该 harness 执行(仅结构/状态门),`--check`
    MUST 显式执行之;未配置时显式 `--check` MUST 追加 INFO 提示其无效且 MUST NOT 执行任何命令;环境变量
    `LLMAN_SDD_HARNESS_ACTIVE=1` 存在时 MUST NOT 执行并 MUST 为每个 spec 条目追加 INFO(嵌套调用守卫),harness 子进程 MUST
    继承该变量;review 的校验 sweep 与 show 的 validate 门 MUST NOT 执行 harness;finalize/archive 的预合并验收由
    change-lifecycle r81 规定,本条不再禁止收口执行;`specs.framework` 派生的缺省命令 MUST NOT 被执行;CLI help 与模板文案 MUST 与该语义一致。

    场景: 配置 check_command 时缺省跳过且 check 显式执行
      假如 一个含两个 capability 且 check_command 无占位符并写标记文件的临时仓库
      当 运行 validate --specs
      那么 标记文件不存在
      当 运行 validate --specs --check
      那么 标记文件恰有 1 行
      当 运行 validate --help
      那么 help 文案说明缺省跳过 harness 且 --check 显式执行


    场景: 嵌套调用守卫
      假如 一个含两个 capability 且 check_command 无占位符并写标记文件的临时仓库
      当 在设置 LLMAN_SDD_HARNESS_ACTIVE=1 的环境下运行 validate --specs --check --json --include-info
      那么 标记文件不存在
      而且 输出含 "nested invocation" 的 INFO


    场景: 未配置 check_command 时 check 无效提示
      假如 一个含有效 specs 的临时仓库
      当 运行 validate --specs --check --json --include-info
      那么 输出含 "--check has no effect" 的 INFO
      而且 退出码为 0


    场景: review 与 show 不执行 harness
      假如 一个含两个 capability 且 check_command 无占位符并写标记文件的临时仓库
      当 运行 review 与 show 任一 capability
      那么 标记文件不存在

  @req:r47
  规则: validate 目标与模式 flag
    `validate` MUST 支持位置参数 `[item]`(spec id 或 change id 自动消歧)、`--all`(全部 changes 与 specs)、
    `--changes`/`--specs`(限定域)、`--type change|spec`(强制消歧)、`--stage draft|designed|planned|full`(change
    域按前代产物语义判门:designed 需 design.md、planned 需 design.md+tasks.md、full 另需 tasks.md)、`--strict`(WARNING
    按前代范围升级为 ERROR 并影响退出)与 `--json`/`--compact-json`(输出
    items[].{id,type,valid,issues[].{level,path,message}},summary{items,passed,failed},version
    的既定结构);`--specs` 旧 no-op 标记 MUST 废除,域限定语义由 `--changes`/`--specs` 承担;`validate` MUST 支持
    `--output <toon|json|compact-json|human>` 且缺省输出 TOON(items 与 json 同载荷),`--output human` 输出前代人读报告行(含
    Totals 收尾与 Next steps 引导),Next steps 引导 MUST 仅出现在 human 模式,stderr 错误摘要(`Error: validation failed`、
    阶段强制缺失行)不随输出格式变化。

    场景: validate 目标消歧与阶段门
      假如 一个含 specs 与已绑定 change 的临时仓库
      当 运行 validate --stage full 指向 draft 阶段 change
      那么 退出码非零且按产物报阶段强制缺失(前代语义)


    场景: 输出模式缺省 TOON 且 human与json分流
      假如 一个全部 specs 结构合格的临时仓库
      当 运行 validate --specs
      那么 stdout 为 TOON 且退出码为 0
      当 运行 validate --specs --output human
      那么 stdout 含 Totals 收尾且不含 "Next steps"
      当 运行 validate --specs --output json
      那么 stdout 为含 items、summary 与 version 的 JSON 且不含 "Next steps"


    场景: 同名 spec 与 change 以 --type 消歧
      假如 一个同时存在名为 "dual" 的 spec 与 change 的临时仓库
      当 运行 validate dual --type change --json
      那么 items 仅含 type 为 change 的条目
      当 运行 validate dual --type spec --json
      那么 items 仅含 type 为 spec 的条目

  @req:r48
  规则: specs.check_command 占位符与结果映射
    `specs.check_command`(经旧 `bdd.check_command` 兼容提升等价生效)MUST 支持 `{feature_path}`(capability 主 .feature 文件的仓库根相对路径,扁平或目录式布局)、
    `{feature_dir}`(该文件的父目录)与 `{feature_name}`(capability id)占位符,并 MUST 按待校验 capability 逐项替换后执行;同一次
    validate 内展开后相同的命令串 MUST 至多执行一次(无占位符即整批一次,batch-once);执行 cwd MUST 为项目根;退出码 0 MUST 对该 capability 产出
    INFO,非零 MUST 产出 ERROR(消息含退出码与展开后的命令)并使该 capability FAIL,无法启动 MUST 产出 ERROR;复用缓存结果时 MUST 保持原判定级别。

    场景: 占位符按 capability 逐项执行
      假如 一个含两个 capability 且 check_command 按 feature_name 写标记文件的临时仓库
      当 运行 validate --specs --check
      那么 标记文件行集合等于全部 capability id
      而且 退出码为 0


    场景: 无占位符整批只执行一次
      假如 一个含两个 capability 且 check_command 无占位符并写标记文件的临时仓库
      当 运行 validate --specs --check
      那么 标记文件恰有 1 行


    场景: harness 失败映射为 capability FAIL
      假如 一个含两个 capability 且 check_command 以退出码 3 失败的临时仓库
      当 运行 validate --specs --check --json
      那么 每个 spec 条目 valid 为 false 且含 "spec check failed (exit 3)" 的 ERROR
      而且 退出码非零

  @req:r78
  规则: tasks.md 收口伪任务 WARNING
    校验活跃 change(归档不回溯)的 tasks.md 未勾选任务标题时,去掉 `T<n>[a-z]?:`
    编号前缀后若以收口动词开头(`/^(收口|归档|finalize\b|archive\b)/` 匹配首 token,只看开头),MUST 报 WARNING(path `tasks`),文案
    MUST 含 `finalize is a pipeline step` 且指明收口任务是流水线步骤、应从 tasks.md 移除(finalize/archive
    的任务门要求全部任务已勾);仅以收口为对象但非收口步骤的任务标题(如以「修复 finalize 任务门」开头)MUST NOT 触发;`--strict` 下按既有 WARNING 升级语义处理。

    场景: 收口伪任务触发 WARNING 且不改退出码
      假如 一个已绑定且含未勾选任务「- [ ] T6: 收口——finalize」的临时仓库
      当 对该 change 运行 validate --json
      那么 输出含 path 为 tasks 的 WARNING 且含 "finalize is a pipeline step"
      而且 退出码不因该 WARNING 变化(非 strict)


    场景: 以收口为对象的任务不触发 WARNING
      假如 一个已绑定且含未勾选任务「- [ ] T3: 修复 finalize 任务门」的临时仓库
      当 对该 change 运行 validate --json
      那么 输出不含 "finalize is a pipeline step"

  @req:r73
  规则: frontmatter 依赖引用解析与单一解析口径
    proposal frontmatter 的 `depends_on` 与 `blocks` 每项 MUST 命中活跃 change(叶子目录名)、`changes/archive/`
    下目录名精确为 `<YYYY-MM-DD>-<id>` 的归档条目或 `changes/archive/` 下平铺冻结卡 `<YYYY-MM-DD>-<id>.yaml`(以文件名去 `.yaml`
    后缀并取日期前缀之后部分精确匹配 id),均未命中 MUST 报 ERROR(消息含 `references unknown change: <id>`),命中归档或平铺卡 MUST NOT 产出
    issue;`changes/archive/` 目录是否存在 MUST NOT 影响该判定;frontmatter 块 MUST 以单一口径切分(首行 `---`,闭合为独占一行的
    `---`,其后为换行或文件结束),依赖、绑定与 `needs_specs_change` 的读取 MUST 共用该口径;`needs_specs_change` MUST 仅从
    frontmatter 读取,正文同名文本 MUST NOT 影响判定。

    场景: 未知依赖与平铺卡依赖解析
      假如 一个含归档目录 "2026-01-01-other" 与平铺冻结卡 "2026-01-02-flat.yaml" 的临时仓库
      当 对 depends_on 为 "ghost" 的 change 运行 validate --json
      那么 输出含 "references unknown change: ghost" 的 ERROR
      当 对 depends_on 为 "other" 的 change 运行 validate --json
      那么 该 change 无依赖相关 issue
      当 对 depends_on 为 "flat" 的 change 运行 validate --json
      那么 该 change 无依赖相关 issue


    场景: 正文同名文本不影响 needs_specs_change
      假如 一个 stage=full 已绑定但 specs 未 landed 且正文含 "needs_specs_change: false" 的临时仓库
      当 对该 change 运行 validate --json
      那么 输出含 specs not landed WARNING 且带 llman-sdd-propose 引导

  @req:r87
  规则: change id 全局唯一性门禁
    validate MUST 枚举活跃 change id(叶子目录名)、归档目录 `<YYYY-MM-DD>-<id>` 与平铺冻结卡 `<YYYY-MM-DD>-<id>.yaml` 拆解出的
    id,任一 id 同时以活跃与归档/冻结形态存在或重复出现于归档/冻结集合 MUST 报 ERROR(消息含 `duplicate change id: <id>`);仅活跃存在 MUST NOT
    产出 issue。

    场景: 活跃与冻结 id 冲突报错
      假如 一个含活跃 change "demo" 与归档目录 "2026-01-01-demo" 的临时仓库
      当 运行 validate --changes --json
      那么 输出含 "duplicate change id: demo" 的 ERROR
      假如 一个仅含活跃 change "demo" 的临时仓库
      当 运行 validate --changes --json
      那么 输出不含 "duplicate change id"

  @req:r74
  规则: 用户输出不含内部需求编号
    `validate` 与 `change` 各子命令写到 stdout/stderr 的文案 MUST NOT 含内部需求编号引用(形如 `(r111)`、
    `(sdd-workflow r29 …)`、`spec-format r133`);同一 git 门在不同子命令间 MUST 使用同一文案族(detached HEAD、非绑定分支、默认分支、
    脏工作树),文案 MUST 含子命令名。

    场景: 失败路径输出无内部编号且文案族一致
      假如 一个已完成 start 并在特性分支有新提交的临时仓库
      当 依次触发非法 change_id.pattern、不存在的 attach --base、detached HEAD 与非绑定分支 finalize 四条失败路径
      那么 四次输出均不含内部需求编号
      而且 detached HEAD 与非绑定分支的报错分别含 "refuses a detached HEAD" 与 "must run on the bound branch"
  @req:r91
  规则: 根发现与 validate 双粒度
    多根枚举:llman-sdd MUST 从 git 根(或 `--directory <path>` 指定起点)按约定自动发现全部有效 llmanspec 根(以 config.yaml 或 specs/
    判定,深度受 --max-scan-depth 约束,排除 node_modules/target/.git),git 根自身的 llmanspec 恒为第 0 号根。单根解析:各命令以
    `--directory <path>` 或进程当前工作目录为起点,自起点向上取最近有效实例,该契约与只读命令接入见 cli 域 @req:r109;仅发现单根时
    所有命令输出 MUST 与单根时代逐字节一致。validate --specs 双粒度共用同一算子:逐根(缺省 cwd 语义,--directory <path> 固定发现起点)
    与聚合(--all-roots 对每个发现根执行同一套结构校验与该根 config 的 check_command batch-once,结果按根分组,单根输出形状零漂移);
    聚合退出码 MUST 为任一根红即红,缺省 MUST NOT 自动聚合。聚合报告的观测覆盖面 MUST 含 change id 粒度(叶目录名与归档 dated id),
    MUST NOT 仅限 specs 粒度(逐根结构校验仍为 specs 粒度,change 粒度经下述观测段呈现);聚合报告 MUST 携带跨根同号观测段 `crossRootCollisions[]`,每条为 {namespace: spec|req|change,
    value, roots[]},确定性排序(先 namespace 后 value,roots 按根相对路径序),并在 summary 以 crossRootCollisions 字段给出计数;
    human 形态 MUST 在该段尾附一行指向 `--directory` 的处置指引,machine 形态 MUST NOT 携带该行;观测段 MUST NOT 影响退出码。
    仅发现单根时 MUST NOT 产出该字段(不是空数组),以守住单根逐字节一致铁律。

    场景: 聚合模式按根执行
      假如 一个含根与子根双 llmanspec 的临时仓库
      当 运行 validate --specs --all-roots
      那么 聚合输出按根分组且两根各执行一次

    场景: 聚合退出码任一根红即红
      假如 一个子根 check_command 失败的临时仓库
      当 运行 validate --specs --all-roots --check
      那么 聚合退出码非零

    场景: 嵌套目录下聚合逐根读各自注册表
      假如 一个根与子根含不同 capability 的临时仓库
      当 在子包子目录运行 validate --all-roots --json
      那么 各根分组条目为各自实例根的注册表且无跨根撞号观测

  @req:r99
  规则: proposal title 必填门
    活跃 change 的 proposal frontmatter MUST 携带非空 `title` 字段(一句话概念式人类可读标题,不复读 change id):缺字段或值为空串时
    validate MUST 报 ERROR 且错误消息 MUST 引导补写;`changes/archive/` 下的 proposal 免检;CLI 生成的 proposal 骨架 MUST 预填非空
    title 占位,使新起草的 change 直接通过本门。


    场景: 缺 title 字段被拒
      假如 一个活跃 change 的 proposal frontmatter 无 title 字段的临时仓库
      当 对该 change 运行 validate
      那么 输出含缺 title 的 ERROR 且退出码非零

    场景: 空 title 被拒
      假如 一个活跃 change 的 proposal frontmatter 为 title: 空串的临时仓库
      当 对该 change 运行 validate
      那么 输出含 title 为空的 ERROR

    场景: change new 骨架自带占位过门
      假如 一个经 change new 刚生成骨架的临时仓库
      当 对该骨架 change 运行 validate
      那么 骨架自带的非空 title 占位通过本门（无 title 相关 ERROR）
  @req:r104
  规则: 状态流转表按场景 tag 定界发现
    validate MUST 对每个含例子表的场景大纲按场景级 tag 次序决定是否纳入状态流转校验,不依赖配置开关。
    同一场景同时挂 @transitions 与 @no-transitions MUST 判 ERROR,消息含 conflicting @transitions and @no-transitions tags。
    仅挂 @no-transitions MUST 整表跳过,即使表头命中特征词。
    仅挂 @transitions MUST 强制纳入;特征列不全时由结构门禁拦截。
    无 tag 时,例子表头出现 from/初始状态、event/事件、to/目标状态 三族中至少两族即纳入。
    纳入之后的图论门禁见 @req:r124、@req:r125、@req:r126、@req:r127。issue 挂载路径为 <cap>/transitions/<req_id>。

    场景: @no-transitions 整表跳过
      假如 一个挂 @no-transitions 且含孤岛状态的流转表临时仓库
      当 运行 validate --specs --json
      那么 该 capability 通过且无状态流转 ERROR

    场景: @transitions 强制纳入残缺表
      假如 一个挂 @transitions 且缺 event 列的流转表临时仓库
      当 运行 validate --specs --json
      那么 该流转表判 ERROR 且消息含 "requires a runnable non-empty Examples table"

    场景: 双 tag 冲突
      假如 一个同时挂 @transitions 与 @no-transitions 的合法流转表临时仓库
      当 运行 validate --specs --json
      那么 该流转表判 ERROR 且消息含 "conflicting @transitions and @no-transitions tags"

    场景: 无 tag 嗅探仍拦截孤岛
      假如 一个无 tag 且含孤岛状态的流转表临时仓库
      当 运行 validate --specs --json
      那么 该流转表判 ERROR 且消息含 "unreachable state"

  @req:r124
  规则: 状态流转表结构与占位符门禁
    已纳入的例子表 MUST 是可运行的非空表,并具备 from/event/to 三列(中文别名 初始状态/事件/目标状态 同等)、至少一行数据、from/event/to 无空单元格、以及至少两个不同状态。
    任一不满足 MUST 判 ERROR,消息含 requires a runnable non-empty Examples table,并且不再执行后续门禁。
    Given、When、Then MUST 分别绑定表头对应的 from、event、to 占位符。存在 guard/守卫 列时,Given 或 When MUST 再绑定该列占位符。
    未绑定 MUST 判 ERROR,消息含 steps must bind placeholders。

    场景: 缺事件列被结构门禁拒绝
      假如 一个无 tag 且缺 event 列的流转表临时仓库
      当 运行 validate --specs --json
      那么 该流转表判 ERROR 且消息含 "requires a runnable non-empty Examples table"

    场景: 步骤未绑定占位符被拒绝
      假如 一个步骤未绑定 from/event/to 占位符的流转表临时仓库
      当 运行 validate --specs --json
      那么 该流转表判 ERROR 且消息含 "steps must bind placeholders"

    场景: 空单元格被拒绝
      假如 一个事件单元格为空的流转表临时仓库
      当 运行 validate --specs --json
      那么 该流转表判 ERROR 且消息含 "requires a runnable non-empty Examples table"

    场景: 只有一个状态被拒绝
      假如 一个只有一个状态的流转表临时仓库
      当 运行 validate --specs --json
      那么 该流转表判 ERROR 且消息含 "requires a runnable non-empty Examples table"

    场景: 中文列名的合法流转表通过
      假如 一个使用中文列名且来回切换的合法流转表临时仓库
      当 运行 validate --specs --json
      那么 该 capability 通过且无状态流转 ERROR

    场景: 中文列缺事件列被结构门禁拒绝
      假如 一个使用中文列名且缺事件列的流转表临时仓库
      当 运行 validate --specs --json
      那么 该流转表判 ERROR 且消息含 "requires a runnable non-empty Examples table"

    场景: 守卫列未绑定占位符被拒绝
      假如 一个含守卫列但步骤未绑定守卫占位符的流转表临时仓库
      当 运行 validate --specs --json
      那么 该流转表判 ERROR 且消息含 "steps must bind placeholders"

  @req:r125
  规则: 状态流转确定性门禁
    同一 (from, event, guard) MUST 只出现一次。完全相同的重复行,或同一键指向不同目标状态,都 MUST 判 ERROR,消息含 non-deterministic or duplicate transition。
    guard 不同的两行是不同转移,MUST 通过本门禁。

    场景: 同一事件指向不同目标被拒绝
      假如 一个同一事件指向两个目标状态的流转表临时仓库
      当 运行 validate --specs --json
      那么 该流转表判 ERROR 且消息含 "non-deterministic or duplicate transition"

    场景: 完全相同的重复行被拒绝
      假如 一个同一转移重复两行的流转表临时仓库
      当 运行 validate --specs --json
      那么 该流转表判 ERROR 且消息含 "non-deterministic or duplicate transition"

    场景: 不同守卫的同一事件通过
      假如 一个同一事件按不同守卫通往不同目标且都能回到初始状态的流转表临时仓库
      当 运行 validate --specs --json
      那么 该 capability 通过且无状态流转 ERROR

  @req:r126
  规则: 状态流转可达门禁
    从例子表首行 from 出发,沿有向边不可达的状态 MUST 判 ERROR,消息含 unreachable state。

    场景: 孤岛状态被拒绝
      假如 一个无 tag 且含孤岛状态的流转表临时仓库
      当 运行 validate --specs --json
      那么 该流转表判 ERROR 且消息含 "unreachable state"

  @req:r127
  规则: 状态流转终态与回初态门禁
    图上出度为 0 的状态是终态。存在终态时,到不了任何终态的非终态 MUST 判 ERROR,消息含 cannot reach any terminal state。
    没有终态时,回不到首行初始状态的状态 MUST 判 ERROR,消息含 cannot return to the initial state。只指向自身的吸收态属于这一类。
    每个状态都能回到初始状态的纯环 MUST 通过。

    场景: 到不了终态被拒绝
      假如 一个存在终态但有状态到不了终态的流转表临时仓库
      当 运行 validate --specs --json
      那么 该流转表判 ERROR 且消息含 "cannot reach any terminal state"

    场景: 单向环区回不到初始状态被拒绝
      假如 一个没有终态且存在回不到初始状态的环区的流转表临时仓库
      当 运行 validate --specs --json
      那么 该流转表判 ERROR 且消息含 "cannot return to the initial state"

    场景: 自环吸收态回不到初始状态被拒绝
      假如 一个进入后只指向自身的吸收态流转表临时仓库
      当 运行 validate --specs --json
      那么 该流转表判 ERROR 且消息含 "cannot return to the initial state"

    场景: 合法纯环通过
      假如 一个两个状态互相到达的合法流转表临时仓库
      当 运行 validate --specs --json
      那么 该 capability 通过且无状态流转 ERROR

  @req:r161
  规则: 人类定理（Human Theorems）纯域解析、哈希封签门禁与只读权限锁
    项目 MAY 在 `llmanspec/theorems/*.md` 沉淀少量由人类维护的硬不变量（每条以 `## theorem:<id>` 声明，含必填 `statement` 与可选 `rationale`/`gate`/`scope`）；缺失该目录时 MUST 保持零报错向后兼容。
    纯域 MUST 提供 `parseTheoremFile`、`validateTheoremSet`、`buildTheoremLockManifest` 与 `verifyTheoremLockManifest`（零 I/O）；CLI MUST 提供 `llman-sdd theorem list/check/lock/unlock`：`lock` 计算并写入 `llmanspec/theorems/.theorems.lock.json` 且设为只读（`--root` 打印 `sudo chown` 加固命令而不静默阻塞），`unlock` 恢复可写供人类修改，`check` 检出语法错误、重复 ID 或未经重新封签的篡改并以退出码 1 拒绝（`--run-gates` 额外顺序执行关联门禁命令）。

    场景: 人类定理封签校验通过且未经重签的篡改被 check 以非零退出码拦截
      假如 一个包含人类定理文档的临时仓库
      当 依次运行 theorem lock、theorem check，再篡改定理正文后再次运行 theorem check
      那么 封签后 check 退出码为 0 且篡改后 check 退出码非零并指明篡改文件
