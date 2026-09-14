# language: zh-CN
# capability: validation
# purpose: 定义 specs 校验引擎的判定规则域、报告行格式与 BDD 检查退出码语义。
# scope: packages/core/src/validation/, apps/cli/src/, tests/golden/check-validate.ts

功能: validation

  @req:r11 @human
  场景: 判定聚合与报告行格式
    - 校验 MUST 按 capability 聚合判定:任一 ERROR 即 `FAIL spec/<capability>`,否则 `OK spec/<capability>`;报告 MUST 以 `Totals: N passed, M failed (K items)` 收尾;存在 FAIL 时进程退出码 MUST 非零。

  @req:r12 @human
  场景: 规则域(与 v1 判定等价)
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
