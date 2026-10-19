# language: zh-CN
# purpose: 定义 review 五信号聚合审查的合同与 archive freeze/thaw 冷备合同(7z 格式自洽双向回置)。

功能: review-freeze

  @req:r23
  规则: review 四信号聚合合同
    `review` MUST 支持 `--output <toon|json|compact-json|human>` 且缺省(无输出 flag)输出 TOON(IR 与 json
    同载荷);`--json`/`--compact-json` 为兼容别名,其 JSON 输出与前代字节一致;`--output human` 输出前代人读行形态;退出码语义不随输出格式变化。
    `review` MUST 输出 signals 数组,元素字段 MUST 为 kind/capability/count/detail;kind MUST 覆盖 unbound(未绑定需求,即无 runnable
    嵌套场景的规则:0 场景或嵌套场景全部带 @skip/@experimental)、locked(恒 0)、
    validate(sweep FAIL 汇总;前代快照内部 sweep 的恒失败缺陷不复制);JSON MUST 含 summary{criticalCount,
    warningCount},warningCount MUST 等于 unbound 信号计数与在途 change 未勾任务警告数之和,criticalCount MUST 等于 sweep FAIL
    的 capability 数;在途 change 的未勾任务 MUST 计为 warning,MUST NOT 计入 criticalCount(开发期 review 不得因未勾任务恒失败);
    退出码 MUST 仅在 criticalCount > 0 时非零;`--capability` MUST 限定单一
    capability;`--export-html <path>` MUST 写出自包含 HTML 报告。
    `review` 的内部 sweep 与 `validate --all` MUST 对同一 specs 树判定一致
    (同绿同红):两者对同一文件分配的 spec id MUST 相同,sweep 的 validate
    信号 MUST NOT 因调用方装载路径形态(绝对/相对)不同而翻转——前代快照
    内部 sweep 的恒失败缺陷以任意路径形态都不复制。

    场景: review 信号形状合法
      假如 本仓库的真实 llmanspec 工作区
      当 运行 review
      那么 signals 覆盖三种 kind
      而且 summary 含 criticalCount 与 warningCount
      而且 退出码与 criticalCount 一致

    场景: review sweep 与 validate --all 同判定
      假如 一个已初始化且 specs 合法的临时仓库
      当 运行 review --json 与 validate --all
      那么 review 退出码 0 且 validate 信号无 FAIL
      而且 validate --all 退出码 0


    场景: review 兼容输出别名可用
      假如 本仓库的真实 llmanspec 工作区
      当 运行 review --compact-json 与 review --output compact-json
      那么 两输出均为单行 JSON 且可被 JSON.parse


    场景: export-html 产出自包含报告
      假如 本仓库的真实 llmanspec 工作区
      当 运行 review --export-html 到 llman-review.html
      那么 导出 HTML 报告存在且自包含

  @req:r24
  规则: freeze 冷备合同
    `archive freeze` MUST 将候选归档目录的正文(proposal.md/design.md/tasks.md/specs 等)写入
    `llmanspec/changes/archive/freezed_changes.7z.archived`,并为每个冻结候选生成平铺卡
    `llmanspec/changes/archive/<YYYY-MM-DD>-<id>.yaml` 替代原目录(原目录删除);候选 MUST 为目录名带 `YYYY-MM-DD-` 前缀且早于
    `--before` 日期者,已存在同日期平铺卡的条目 MUST 不再重复冻结,`--keep-recent N` MUST 按名保留最近 N 个不冻结;`--dry-run` MUST
    仅列候选不做变更;`--list` MUST 列出冻结 change 名。
    平铺卡 MUST 为单文档纯 YAML(无 `---` 围栏,单文档 YAML 解析器直接可解析),内容 MUST 含冻结 change 的 `title` 与 `depends_on`(proposal
    frontmatter 的 depends_on 值,归一为单行 flow 数组以保持 graph 依赖边可解析、缺省为 `[]`);title 取值:proposal frontmatter 的
    `title` 非空时优先,否则回退 proposal 正文 H1(存量归档目录兼容);卡 MUST NOT 含 `frozen:` 段或其它
    frontmatter 字段转录(id 与日期由文件名 `<YYYY-MM-DD>-<id>.yaml` 隐含);卡存在即正文必在冷备的权威记录。
    freeze 失败原子性:`7z add` 失败 MUST 回滚已写卡文件且不删除原目录;执行 worktree 非主检出(主检出 = 持有默认分支的 worktree)时,freeze 与
    thaw MUST 输出 WARNING(指明当前为非主检出、冷备可能不完整、建议回主检出执行)且 MUST NOT 阻断:退出码与既有产物形态不变;主检出探测失败 SHALL
    静默跳过警告(best-effort)。

    场景: freeze 冷备合同可执行验收
      假如 一个含三个带日期归档目录的临时仓库
      当 先 dry-run 再按 before 与 keep-recent 执行 freeze
      那么 冷备文件生成且被冻结目录自 archive 删除
      而且 dry-run 仅列候选且未做任何变更
      而且 freeze --list 列出冷备条目


    场景: freeze 生成平铺冻结卡
      假如 一个含带日期归档目录的临时仓库
      当 运行 archive freeze --before 该日期
      那么 冷备文件生成且原目录被 `<YYYY-MM-DD>-<id>.yaml` 平铺卡替代
      而且 平铺卡仅含 title 与 depends_on 且不含 frozen 段


    场景: 非主检出 freeze 警告且归档仍产出
      假如 一个次级 worktree 持有非默认分支且含带日期归档目录的临时仓库
      当 在次级 worktree 运行 archive freeze
      那么 输出含非主检出 WARNING
      而且 冷备仍产出且候选目录被冻结移除


    场景: 平铺卡为纯 YAML 且 title 优先取 frontmatter
      假如 一个带日期归档目录且 proposal frontmatter 含非空 title、正文另含 H1 的临时仓库
      当 运行 archive freeze --before 该日期
      那么 平铺卡内容可被单文档 YAML 解析(无 --- 围栏)
      而且 卡 title 等于 frontmatter 的 title 而非正文 H1

  @req:r25
  规则: thaw 回置与双向兼容
    `archive thaw --change <名>`(可重复)MUST 将冷备中的归档目录回置到 `llmanspec/changes/archive/`;`<名>` 匹配平铺卡
    `<YYYY-MM-DD>-<id>.yaml` 或冷备 7z 内 `<YYYY-MM-DD>-<id>/` 条目,匹配卡时 MUST 在成功后删除对应卡;未知名 MUST 报错并列出可用条目;冷备
    MUST 为 7z 格式,本工具的冻结产物 MUST 可被自身解冻(自洽双向)——卡存在即正文必在冷备的权威记录,thaw 不做文件级 sha256 比对。
    存量兼容:冷备文件 `freezed_changes.7z.archived` 内含未经平铺卡化的旧冻结条目(前代 freeze 产物)MUST 仍可按 7z 条目名回置,未生成卡 MUST NOT
    阻断其列表与回置。

    场景: 冻结解冻自洽
      假如 一个含已归档目录的临时仓库
      当 运行 freeze 后再 thaw 回置该目录
      那么 目录完整回到 changes/archive 下
      而且 内容与冻结前一致


    场景: thaw 回置并移除平铺卡
      假如 一个含平铺冻结卡与冷备的临时仓库
      当 运行 archive thaw --change 该卡名
      那么 原目录完整回到 changes/archive 下且内容与冻结前一致
      而且 平铺卡被删除


    场景: thaw 未知名报错并列出可用条目
      假如 一个含冻结归档条目与冷备的临时仓库
      当 运行 archive thaw --change "nonexistent"
      那么 thaw 未知名报错并列出可用条目

  @req:r33
  规则: review --capability 过滤口径
    `review --capability <C>` MUST 将 unbound 信号限定为 C(其余 capability 的同类信号 MUST NOT
    输出),locked 与 validate 汇总 MUST 保持全局口径,退出码语义不变;`--json` 输出 MUST 同样过滤;未提供 `--capability` 时 MUST 保持全量信号。

    场景: capability 过滤生效
      假如 本仓库的真实 llmanspec 工作区
      当 运行 review --json 并限定单一 capability
      那么 unbound 信号仅含该 capability 且 locked 与 validate 保持全局

  @req:r56
  规则: thaw 目的地覆盖
    `archive thaw` MUST 支持 `--dest <path>` 将回置目标改为指定目录(目录不存在 MUST 自动创建);缺省回置目标 MUST 仍为
    `llmanspec/changes/archive/`。

    场景: thaw 目的地覆盖
      假如 一个含冻结归档的临时仓库
      当 运行 archive thaw --dest
      那么 条目完整落到指定目录
  @req:r120
  规则: freeze 内容过滤(gitignore 层叠)
    freeze 内容过滤 MUST 在打包前对每个候选目录求值忽略链,仅将未被忽略的文件清单传入 7z,不再整目录吸入;
    忽略判定 MUST 为 git 式层叠 .gitignore 求值:候选目录树内各层 .gitignore 由里向外、最深匹配层优先,链 MUST 自候选目录经实例根上溯至项目根(自实例根向上探测 .git 定位),无 .git 时 MUST 以实例根为最外层;
    单层判定 MUST 遵循 gitignore 语义(目录尾斜杠、! 取反、/ 锚定、** 通配),被忽略目录 MUST 整棵剪枝,.git 目录 MUST 恒不入包;
    `--ignore-file <path>`(可重复)MUST 接受 gitignore 格式文件且优先级最高(压过一切 .gitignore 层),文件不存在 MUST 报错中止;
    某候选过滤后零文件时 freeze MUST 在任何写变更之前报错(不写卡、不删目录);无任何忽略源时 MUST 保持既有全量打包行为;人读输出宜含排除计数摘要且退出码语义不变。


    场景: freeze 依据根 .gitignore 排除被忽略产物
      假如 一个临时仓库,实例根本层含忽略 target/ 的 .gitignore,且某带日期归档目录内留有 research/poc/target/ 构建产物与 proposal/design 正文
      当 在含忽略链的仓库运行 archive freeze --before 该日期
      那么 冷备条目不含 target 下任何文件且含全部正文文件,平铺卡照常生成、原目录移除,输出含排除计数

    场景: 嵌套 .gitignore 层叠且项目根规则上溯生效
      假如 一个 git 仓库,其根 .gitignore 忽略 node_modules/,实例根位于子目录,某归档目录内含 research/poc/ 自带锚定忽略 /target 的 .gitignore 及 target 与 node_modules 产物
      当 在实例根运行 archive freeze
      那么 嵌套 target 与 node_modules 均不入包而正文文件入包

    场景: ignore-file 用户补充忽略文件最高优先
      假如 一个临时仓库,其 .gitignore 以 ! 回含 *.bin,另备一份忽略 *.bin 的 gitignore 格式文件
      当 运行 archive freeze --ignore-file 该文件
      那么 归档目录内的 .bin 文件不入包而其余正文入包

    场景: ignore-file 指向不存在文件时报错且零变更
      假如 一个带日期归档目录完好而所指忽略文件缺失的临时仓库
      当 运行 archive freeze --ignore-file 不存在的路径
      那么 报错退出且未写平铺卡、原目录保留

    场景: 过滤后的冷备可自洽解冻
      假如 一个已完成含排除过滤 freeze 的临时仓库
      当 运行 archive thaw --change 该条目
      那么 目录回置且内容为过滤后集合(正文在、被忽略产物不在)且平铺卡删除