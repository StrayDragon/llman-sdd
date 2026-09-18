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
    - 缺 `# capability:` 头注释 MUST 判 ERROR;@human 规则场景描述不含 MUST/SHALL(或 必须/不得/禁止)MUST 判 ERROR;@human 场景未携带 @req 标签 MUST 判 ERROR;@human 与 @executable 同用 MUST 判 ERROR;@manual 无 @human MUST 判 ERROR;跨 specs 全局重复 req_id MUST 对每个涉事 capability 判 ERROR;`# scope:` 声明的路径 MUST 在磁盘存在,缺失判 ERROR。staleness(git scope 漂移)SHALL 在 change 生命周期阶段接入,本能力不判定。

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
    - `validate` MUST 支持位置参数 `[item]`(spec id 或 change id 自动消歧)、`--all`(全部 changes 与 specs)、`--changes`/`--specs`(限定域)、`--type change|spec`(强制消歧)、`--stage draft|designed|planned|full`(change 域按 v1 产物语义判门:designed 需 design.md、planned 需 design.md+tasks.md、full 另需 tasks.md)、`--strict`(WARNING 按 v1 范围升级为 ERROR 并影响退出)与 `--json`/`--compact-json`(输出 items[].{id,type,valid,issues[].{level,path,message}},staleness,summary{items,passed,failed},version 的 v1 结构);`--specs` 旧 no-op 标记 MUST 废除,域限定语义由 `--changes`/`--specs` 承担。

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
