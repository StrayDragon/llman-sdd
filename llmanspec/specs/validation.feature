# language: zh-CN
# capability: validation
# purpose: 定义 specs 校验引擎的判定规则域、报告行格式与 BDD 检查退出码语义。
# scope: packages/core/src/validation/, apps/cli/src/

功能: validation

  @req:r11 @human
  场景: 判定聚合与报告行格式
    - 校验 MUST 按 capability 聚合判定:任一 ERROR 即 `FAIL spec/<capability>`,否则 `OK spec/<capability>`;报告 MUST 以 `Totals: N passed, M failed (K items)` 收尾;存在 FAIL 时进程退出码 MUST 非零。

  @req:r12 @human
  场景: 规则域(种子缺陷判定)
    - 缺 `# capability:` 头注释 MUST 判 ERROR;@human 规则场景描述不含 MUST/SHALL(或 必须/不得/禁止)MUST 判 ERROR;@human 场景未携带 @req 标签 MUST 判 ERROR;@human 与 @executable 同用 MUST 判 ERROR;残留 @manual tag MUST 判迁移 ERROR(0.3.0 起移除);跨 specs 全局重复 req_id MUST 对每个涉事 capability 判 ERROR;`# scope:` 声明的路径 MUST 在磁盘存在,缺失在 `--strict` 下判 ERROR、否则 WARNING(v1 r42 语义)。staleness(git scope 漂移)SHALL 在 change 生命周期阶段接入,本能力不判定。

  @req:r63 @human
  场景: validate 完整性 WARNING(已绑定 change)
    - stage=full 的已绑定 change 若 live specs 未 landed 且 `needs_specs_change` 不为 false,MUST 报带 skill 引导的 WARNING(path `proposal.md`):指引在绑定分支编辑并提交 live specs(llman-sdd-propose)、MUST NOT 建议对已 attach 的 change 重跑 change start、实施以 `llman-sdd show <id> --json` 的 readyToImplement=true 为准(llman-sdd-apply);默认分支上存在 `llmanspec/specs/` 未提交脏改动时,validate MUST 报 WARNING 指引切到绑定分支再编辑(工作区级,每次调用至多一次);两条 WARNING 缺省不阻断,`--strict` 按既有升级语义处理。

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
    那么 FAIL 集合包含 spec 条目
    而且 退出码非零

  @req:r13 @human
  场景: BDD 检查退出码
    - `--check` MUST 按 config `bdd.run_command` batch-once 执行,命令失败 MUST 使退出码非零;`--no-check` MUST 跳过该执行。

  @req:r47 @human
  场景: validate 目标与模式 flag
    - `validate` MUST 支持位置参数 `[item]`(spec id 或 change id 自动消歧)、`--all`(全部 changes 与 specs)、`--changes`/`--specs`(限定域)、`--type change|spec`(强制消歧)、`--stage draft|designed|planned|full`(change 域按 v1 产物语义判门:designed 需 design.md、planned 需 design.md+tasks.md、full 另需 tasks.md)、`--strict`(WARNING 按 v1 范围升级为 ERROR 并影响退出)与 `--json`/`--compact-json`(输出 items[].{id,type,valid,issues[].{level,path,message}},staleness,summary{items,passed,failed},version 的 v1 结构);`--specs` 旧 no-op 标记 MUST 废除,域限定语义由 `--changes`/`--specs` 承担;`validate` MUST 支持 `--output <toon|json|compact-json|human>` 且缺省输出 TOON(items 与 json 同载荷),`--output human` 输出 v1 人读报告行(含 Totals 收尾与 Next steps 引导),Next steps 引导 MUST 仅出现在 human 模式,stderr 错误摘要(`Error: validation failed`、阶段强制缺失行)不随输出格式变化。

  @req:r48 @human
  场景: bdd run_command 占位符替换
    - config `bdd.run_command` MUST 支持 `{feature_dir}`、`{feature_name}`、`{feature_path}` 占位符,含任一占位符时 MUST 按校验目标逐项替换后执行;不含占位符时 MUST 保持 batch-once(整批至多执行一次)。

  @req:r47 @executable
  场景: validate 目标消歧与阶段门
    假如 一个含 specs 与已绑定 change 的临时仓库
    当 运行 validate --stage full 指向 draft 阶段 change
    那么 退出码非零且按产物报阶段强制缺失(v1 语义)

  @req:r48 @executable
  场景: run_command 占位符按目标展开
    假如 一个 run_command 含 {feature_name} 占位符的临时仓库
    当 运行 validate --specs
    那么 runner 按目标逐项执行

  @req:r32 @executable
  场景: INFO 过滤与恢复
    假如 一个含 pending 规则的有效 spec 工作区
    当 运行 validate --all --json 与 validate --all --json --include-info
    那么 缺省输出不含 INFO 级 issue 且 include-info 输出含 INFO 级 issue
    而且 两次运行的 valid 判定与退出码一致
