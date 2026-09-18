# language: zh-CN
# capability: spec-authoring
# purpose: 定义编程式 spec 追加/反查与全局 rN 注册表去重的合同。
# scope: apps/cli/src/, packages/core/src/spec/

功能: spec-authoring

  @req:r41 @human
  场景: spec add-req 追加规则
    - `spec add-req <capability> <req_id> --title <T> --statement <S>`(别名 add-requirement)MUST 校验 req_id 全局唯一(重复 MUST 报错)且 statement 含规范语义词(MUST/SHALL/必须/不得/禁止,缺失 MUST 报错),然后向 `llmanspec/specs/<capability>.feature` 追加一条 `@req:<id> @human` 规则场景(title 进场景名,statement 进描述)并写盘。

  @req:r42 @human
  场景: spec add-scenario 追加验收场景
    - `spec add-scenario <capability> <req_id> <scenario_id> --when <W> --then <T> [--given <G>]` MUST 在目标 req 存在时追加一条 `@req:<req_id> @executable` 验收场景(given 缺省为空);目标 req 不存在 MUST 报错且零副作用。

  @req:r43 @human
  场景: resolve-req 反查与注册表去重
    - `spec resolve-req <req_id>` MUST 输出该 req 的 capability 与 statement,未命中 MUST 报错;`project dedupe-req-ids` MUST 扫描主库(非归档 specs)冲突 rN 并重映射为空闲短 id,`--dry-run` MUST 仅输出映射计划且零副作用。

  @req:r41 @executable
  场景: authoring 追加解析注册表闭环
    假如 一个含单一 capability spec 的临时 specs 目录
    当 运行 spec add-req 与 spec add-scenario
    那么 spec 可被解析且 resolve-req 反查一致

  @req:r43 @executable
  场景: dedupe 重映射冲突
    假如 一个两个 spec 含相同 rN 的临时 specs 目录
    当 运行 project dedupe-req-ids
    那么 后一个文件的 rN 被重映射为空闲 id
