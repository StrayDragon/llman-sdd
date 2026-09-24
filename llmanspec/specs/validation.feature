# language: zh-CN
# capability: validation
# purpose: 定义 specs 校验引擎的判定规则域、报告行格式与 BDD 检查退出码语义。
# scope: packages/core/src/validation/, apps/cli/src/commands/validate.ts, apps/cli/src/harness.ts

功能: validation

  @req:r11 @human
  场景: 判定聚合与报告行格式
    - 校验 MUST 按 capability 聚合判定:任一 ERROR 即 `FAIL spec/<capability>`,否则 `OK spec/<capability>`;报告 MUST 以 `Totals: N passed, M failed (K items)` 收尾;存在 FAIL 时进程退出码 MUST 非零。

  @req:r12 @human
  场景: 规则域(种子缺陷判定)
    - 缺 `# capability:` 头注释 MUST 判 ERROR;@human 规则场景描述不含 MUST/SHALL(或 必须/不得/禁止)MUST 判 ERROR;@human 场景未携带 @req 标签 MUST 判 ERROR;@human 与 @executable 同用 MUST 判 ERROR;残留 @manual tag MUST 判迁移 ERROR(0.3.0 起移除);跨 specs 全局重复 req_id MUST 对每个涉事 capability 判 ERROR;`# scope:` 声明的路径 MUST 在磁盘存在,缺失在 `--strict` 下判 ERROR、否则 WARNING(v1 r42 语义)。staleness(git scope 漂移)SHALL 在 change 生命周期阶段接入,本能力不判定。

  @req:r63 @human
  场景: validate 完整性 WARNING(已绑定 change)
    - stage=full 的已绑定 change 若 live specs 未 landed 且 `needs_specs_change` 不为 false,MUST 报带 skill 引导的 WARNING(path `proposal.md`):指引在绑定分支编辑并提交 live specs(llman-sdd-propose)、MUST NOT 建议对已 attach 的 change 重跑 change start、实施入门 MUST 表述为 `llman-sdd show <id>` 的 specs-landed 门通过(llman-sdd-apply),MUST NOT 以 readyToImplement=true 作为 apply 入门条件(readyToImplement 是 verify/finalize 的完成信号);默认分支上存在 `llmanspec/specs/` 未提交脏改动时,validate MUST 报 WARNING 指引切到绑定分支再编辑(工作区级,每次调用至多一次);两条 WARNING 缺省不阻断,`--strict` 按既有升级语义处理。

  @req:r64 @human
  场景: proposal frontmatter 合法字段集
    - proposal frontmatter 合法字段 MUST 为 depends_on/blocks/branch/base_branch/base_sha/needs_specs_change 六个;合法集外字段(如 status/title/priority/author)MUST 报 ERROR 且错误消息 MUST 列出该字段名与合法字段集;`changes/archive/` 下的 proposal MUST 免检;stage MUST 由磁盘工件与绑定实时推断,MUST NOT 引入任何 frontmatter 字段影响 stage。

  @req:r65 @human
  场景: 孤儿验收场景
    - 无任何 @req 链接的 @executable 验收场景 MUST 被 validate 报 WARNING(孤儿验收),path 为 `<capability>/acceptance/<场景名>`;@req 悬空链接(指向不存在规则)维持 ERROR 不变。

  @req:r32 @human
  场景: INFO 级 issue 缺省过滤
    - `validate` 的 issues 输出(文本与 `--json` 同口径)缺省 MUST 仅含 WARNING 及以上级别,INFO 级 issue(如 pending 规则提示)MUST NOT 出现;`--include-info` MUST 恢复完整 issues;级别过滤 MUST NOT 影响 valid 判定、summary 计数口径与退出码。

  @req:r12 @executable
  场景: 种子缺陷被判 FAIL
    假如 一个含互斥 tag 与重复 req_id 缺陷的 specs 目录
    当 运行 specs 校验
    那么 FAIL 集合恰为互斥 tag 与重复 req_id 涉事的 capability
    而且 退出码非零

  @req:r12 @executable
  场景: 种子缺陷逐类判定
    假如 一个每类种子缺陷各占一个 capability 的临时仓库
    当 运行 validate --specs --json
    那么 缺头注释、缺 MUST、缺 @req、互斥 tag、残留 @manual 与重复 req_id 各 capability 均 valid 为 false 且各含对应 ERROR
    而且 仅缺 scope 路径的 capability 含 WARNING 且 valid 为 true
    当 运行 validate --specs --json --strict
    那么 仅缺 scope 路径的 capability valid 为 false

  @req:r13 @human
  场景: BDD harness 执行与 check 旗标
    - 配置了非空 `bdd.run_command` 时,`validate` 的目标集含 spec 即 MUST 缺省执行该 harness,`--no-check` MUST 跳过执行,`--check` MUST 作为兼容别名(给与不给等价);未配置时显式 `--check` MUST 追加 INFO 提示其无效且 MUST NOT 执行任何命令;环境变量 `LLMAN_SDD_HARNESS_ACTIVE=1` 存在时 MUST NOT 执行并 MUST 为每个 spec 条目追加 INFO(嵌套调用守卫),harness 子进程 MUST 继承该变量;review 的校验 sweep 与 show 的 validate 门 MUST NOT 执行 harness;finalize/archive 的预合并验收由 change-lifecycle r81 规定,本条不再禁止收口执行;`bdd.framework` 派生的缺省命令 MUST NOT 被执行;CLI help 与模板文案 MUST 与该语义一致。

  @req:r47 @human
  场景: validate 目标与模式 flag
    - `validate` MUST 支持位置参数 `[item]`(spec id 或 change id 自动消歧)、`--all`(全部 changes 与 specs)、`--changes`/`--specs`(限定域)、`--type change|spec`(强制消歧)、`--stage draft|designed|planned|full`(change 域按 v1 产物语义判门:designed 需 design.md、planned 需 design.md+tasks.md、full 另需 tasks.md)、`--strict`(WARNING 按 v1 范围升级为 ERROR 并影响退出)与 `--json`/`--compact-json`(输出 items[].{id,type,valid,issues[].{level,path,message}},staleness,summary{items,passed,failed},version 的 v1 结构);`--specs` 旧 no-op 标记 MUST 废除,域限定语义由 `--changes`/`--specs` 承担;`validate` MUST 支持 `--output <toon|json|compact-json|human>` 且缺省输出 TOON(items 与 json 同载荷),`--output human` 输出 v1 人读报告行(含 Totals 收尾与 Next steps 引导),Next steps 引导 MUST 仅出现在 human 模式,stderr 错误摘要(`Error: validation failed`、阶段强制缺失行)不随输出格式变化。

  @req:r48 @human
  场景: bdd run_command 占位符与结果映射
    - `bdd.run_command` MUST 支持 `{feature_path}`(capability 主 .feature 文件的仓库根相对路径,扁平或目录式布局)、`{feature_dir}`(该文件的父目录)与 `{feature_name}`(capability id)占位符,并 MUST 按待校验 capability 逐项替换后执行;同一次 validate 内展开后相同的命令串 MUST 至多执行一次(无占位符即整批一次,batch-once);执行 cwd MUST 为项目根;退出码 0 MUST 对该 capability 产出 INFO,非零 MUST 产出 ERROR(消息含退出码与展开后的命令)并使该 capability FAIL,无法启动 MUST 产出 ERROR;复用缓存结果时 MUST 保持原判定级别。

  @req:r47 @executable
  场景: validate 目标消歧与阶段门
    假如 一个含 specs 与已绑定 change 的临时仓库
    当 运行 validate --stage full 指向 draft 阶段 change
    那么 退出码非零且按产物报阶段强制缺失(v1 语义)

  @req:r47 @executable
  场景: 输出模式与 strict 升级
    假如 一个仅含缺 scope 路径 WARNING 的临时仓库
    当 运行 validate --specs
    那么 stdout 为 TOON 且退出码为 0
    当 运行 validate --specs --strict --output human
    那么 stdout 含 "Next steps" 且退出码非零
    当 运行 validate --specs --strict --output json
    那么 stdout 为含 items、summary 与 version 的 JSON 且不含 "Next steps"

  @req:r47 @executable
  场景: 同名 spec 与 change 以 --type 消歧
    假如 一个同时存在名为 "dual" 的 spec 与 change 的临时仓库
    当 运行 validate dual --type change --json
    那么 items 仅含 type 为 change 的条目
    当 运行 validate dual --type spec --json
    那么 items 仅含 type 为 spec 的条目

  @req:r48 @executable
  场景: 占位符按 capability 逐项执行
    假如 一个含两个 capability 且 run_command 按 feature_name 写标记文件的临时仓库
    当 运行 validate --specs
    那么 标记文件行集合等于全部 capability id
    而且 退出码为 0

  @req:r48 @executable
  场景: 无占位符整批只执行一次
    假如 一个含两个 capability 且 run_command 无占位符并写标记文件的临时仓库
    当 运行 validate --specs
    那么 标记文件恰有 1 行

  @req:r48 @executable
  场景: harness 失败映射为 capability FAIL
    假如 一个含两个 capability 且 run_command 以退出码 3 失败的临时仓库
    当 运行 validate --specs --json
    那么 每个 spec 条目 valid 为 false 且含 "bdd harness failed (exit 3)" 的 ERROR
    而且 退出码非零

  @req:r32 @executable
  场景: INFO 过滤与恢复
    假如 一个含 pending 规则的有效 spec 工作区
    当 运行 validate --all --json 与 validate --all --json --include-info
    那么 缺省输出不含 INFO 级 issue 且 include-info 输出含 INFO 级 issue
    而且 两次运行的 valid 判定与退出码一致

  @req:r11 @executable
  场景: 报告行聚合与退出码
    假如 一个含种子缺陷 spec 的临时仓库
    当 在该仓库运行 validate --specs --output human
    那么 stdout 符合正则 "FAIL spec/[a-z-]+"
    而且 stdout 符合正则 "OK spec/"
    而且 stdout 符合正则 "Totals: \d+ passed, \d+ failed \(\d+ items\)"
    而且 退出码为 1

  @req:r13 @executable
  场景: 配置 run_command 时缺省执行且 no-check 跳过
    假如 一个含两个 capability 且 run_command 无占位符并写标记文件的临时仓库
    当 运行 validate --specs --no-check
    那么 标记文件不存在
    当 运行 validate --specs
    那么 标记文件恰有 1 行
    当 运行 validate --help
    那么 help 文案说明缺省执行 harness 且 --no-check 跳过

  @req:r13 @executable
  场景: 嵌套调用守卫
    假如 一个含两个 capability 且 run_command 无占位符并写标记文件的临时仓库
    当 在设置 LLMAN_SDD_HARNESS_ACTIVE=1 的环境下运行 validate --specs --json --include-info
    那么 标记文件不存在
    而且 输出含 "nested invocation" 的 INFO

  @req:r13 @executable
  场景: 未配置 run_command 时 check 无效提示
    假如 一个含有效 specs 的临时仓库
    当 运行 validate --specs --check --json --include-info
    那么 输出含 "--check has no effect" 的 INFO
    而且 退出码为 0

  @req:r13 @executable
  场景: review 与 show 不执行 harness
    假如 一个含两个 capability 且 run_command 无占位符并写标记文件的临时仓库
    当 运行 review 与 show 任一 capability
    那么 标记文件不存在

  @req:r63 @executable
  场景: 完整性 WARNING 与脏 specs 警告
    假如 一个 stage=full 已绑定但 specs 未 landed 的临时仓库
    当 对该 change 运行 validate --json
    那么 输出含 specs not landed WARNING 且带 llman-sdd-propose 引导
    而且 不建议重跑 change start
    而且 引导以 specs-landed 门为 apply 入门且不含 "readyToImplement=true"
    当 切回默认分支并弄脏 llmanspec/specs 后再次运行 validate
    那么 输出含工作区级脏 specs WARNING

  @req:r63 @executable
  场景: 完整性 WARNING 在 strict 下升级
    假如 一个 stage=full 已绑定但 specs 未 landed 的临时仓库
    当 对该 change 运行 validate --json --strict
    那么 specs not landed 条目级别为 ERROR 且退出码非零

  @req:r64 @executable
  场景: frontmatter 非法字段被拒
    假如 一个 proposal frontmatter 含未知字段 "status" 的临时仓库
    当 对该 change 运行 validate --output human
    那么 输出含未知字段 "status" 与合法字段集提示
    当 把 frontmatter 改写为六个合法字段后再次运行 validate
    那么 退出码为 0

  @req:r64 @executable
  场景: 归档 proposal 免检
    假如 一个 changes/archive 下 proposal 含未知字段 "status" 的临时仓库
    当 运行 validate --changes --json
    那么 输出不含 unknown field 相关 issue

  @req:r65 @executable
  场景: 孤儿验收场景报 WARNING
    假如 一个含孤儿验收场景的 spec 临时仓库
    当 对该 spec 运行 validate --json
    那么 孤儿验收 WARNING 的 path 为 "orph/acceptance/孤儿验收"

  @req:r65 @executable
  场景: 悬空 req 链接报 ERROR
    假如 一个验收场景挂接不存在规则 id 的 spec 临时仓库
    当 对该 spec 运行 validate --json
    那么 该 spec 条目 valid 为 false 且含悬空链接 ERROR

  @req:r78 @human
  场景: tasks.md 收口伪任务 WARNING
    - 校验活跃 change(归档不回溯)的 tasks.md 未勾选任务标题时,去掉 `T<n>[a-z]?:` 编号前缀后若以收口动词开头(`/^(收口|归档|finalize\b|archive\b)/` 匹配首 token,只看开头),MUST 报 WARNING(path `tasks`),文案 MUST 含 `finalize is a pipeline step` 且指明收口任务是流水线步骤、应从 tasks.md 移除(finalize/archive 的任务门要求全部任务已勾);仅以收口为对象但非收口步骤的任务标题(如以「修复 finalize 任务门」开头)MUST NOT 触发;`--strict` 下按既有 WARNING 升级语义处理。

  @req:r78 @executable
  场景: 收口伪任务触发 WARNING 且不改退出码
    假如 一个已绑定且含未勾选任务「- [ ] T6: 收口——finalize」的临时仓库
    当 对该 change 运行 validate --json
    那么 输出含 path 为 tasks 的 WARNING 且含 "finalize is a pipeline step"
    而且 退出码不因该 WARNING 变化(非 strict)

  @req:r78 @executable
  场景: 以收口为对象的任务不触发 WARNING
    假如 一个已绑定且含未勾选任务「- [ ] T3: 修复 finalize 任务门」的临时仓库
    当 对该 change 运行 validate --json
    那么 输出不含 "finalize is a pipeline step"

  @req:r73 @human
  场景: frontmatter 依赖引用解析与单一解析口径
    - proposal frontmatter 的 `depends_on` 与 `blocks` 每项 MUST 命中活跃 change(叶子目录名)或 `changes/archive/` 下目录名精确为 `<YYYY-MM-DD>-<id>` 的归档条目,均未命中 MUST 报 ERROR(消息含 `references unknown change: <id>`),命中归档 MUST NOT 产出 issue;`changes/archive/` 目录是否存在 MUST NOT 影响该判定;frontmatter 块 MUST 以单一口径切分(首行 `---`,闭合为独占一行的 `---`,其后为换行或文件结束),依赖、绑定与 `needs_specs_change` 的读取 MUST 共用该口径;`needs_specs_change` MUST 仅从 frontmatter 读取,正文同名文本 MUST NOT 影响判定。

  @req:r73 @executable
  场景: 未知依赖在含归档目录的仓库中报错
    假如 一个含归档条目 "2026-01-01-other" 的临时仓库
    当 对 depends_on 为 "ghost" 的 change 运行 validate --json
    那么 输出含 "references unknown change: ghost" 的 ERROR
    当 对 depends_on 为 "other" 的 change 运行 validate --json
    那么 该 change 无依赖相关 issue

  @req:r73 @executable
  场景: 正文同名文本不影响 needs_specs_change
    假如 一个 stage=full 已绑定但 specs 未 landed 且正文含 "needs_specs_change: false" 的临时仓库
    当 对该 change 运行 validate --json
    那么 输出含 specs not landed WARNING 且带 llman-sdd-propose 引导

  @req:r74 @human
  场景: 用户输出不含内部需求编号
    - `validate` 与 `change` 各子命令写到 stdout/stderr 的文案 MUST NOT 含内部需求编号引用(形如 `(r111)`、`(sdd-workflow r29 …)`、`spec-format r133`);同一 git 门在不同子命令间 MUST 使用同一文案族(detached HEAD、非绑定分支、默认分支、脏工作树),文案 MUST 含子命令名;空 scope 报错 MUST 指向 `# scope:` 头注释。

  @req:r74 @executable
  场景: 失败路径输出无内部编号且文案族一致
    假如 一个已完成 start 并在特性分支有新提交的临时仓库
    当 依次触发非法 change_id.pattern、不存在的 attach --base、detached HEAD 与非绑定分支 finalize 四条失败路径
    那么 四次输出均不含内部需求编号
    而且 detached HEAD 与非绑定分支的报错分别含 "refuses a detached HEAD" 与 "must run on the bound branch"
