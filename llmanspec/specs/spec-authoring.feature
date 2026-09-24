# language: zh-CN
# capability: spec-authoring
# purpose: 定义编程式 spec 追加/反查与全局 rN 注册表去重的合同。
# scope: apps/cli/src/commands/spec.ts, packages/core/src/spec/

功能: spec-authoring

  @req:r41 @human
  场景: spec add-req 追加规则
    - `spec add-req <capability> <req_id> --title <T> --statement <S>`(别名 add-requirement)MUST 校验 req_id 全局唯一(重复 MUST 报错)且 statement 含规范语义词(MUST/SHALL/必须/不得/禁止,缺失 MUST 报错;判定 MUST 与 spec-parsing r9 同一口径,英文语义词按词边界匹配,`MUSTARD` 之类子串 MUST NOT 视为命中),然后向目标 spec 追加一条 `@req:<id> @human` 规则场景(title 进场景名,statement 进描述)并写盘。写入目标 MUST 按单一口径解析:扁平 `llmanspec/specs/<capability>.feature` 存在则写之(与目录式并存时扁平优先);否则按 spec id 精确命中的已发现 spec entry(含目录式 `<capability>/<capability>.feature`)写之,不做模糊解析;均未命中 MUST 报错。

  @req:r42 @human
  场景: spec add-scenario 追加验收场景
    - `spec add-scenario <capability> <req_id> <scenario_id> --when <W> --then <T> [--given <G>]` MUST 在目标 req 存在时追加一条 `@req:<req_id> @executable` 验收场景(given 缺省为空);目标 req 不存在 MUST 报错且零副作用。

  @req:r42 @executable
  场景: add-scenario 追加与缺失零副作用
    假如 一个含单一 capability spec 的临时 specs 目录
    当 运行 spec add-scenario 指向存在的 req 与不存在的 req
    那么 存在的 req 追加 @executable 验收场景且 given 缺省为空
    而且 不存在的 req 报错且文件零副作用

  @req:r43 @human
  场景: resolve-req 反查与注册表去重
    - `spec resolve-req <req_id>` MUST 输出该 req 的 capability 与 statement,未命中 MUST 报错;`project dedupe-req-ids` MUST 扫描主库(非归档 specs)冲突 rN 并重映射为空闲短 id,`--dry-run` MUST 仅输出映射计划且零副作用。

  @req:r41 @executable
  场景: authoring 追加解析注册表闭环
    假如 一个含单一 capability spec 的临时 specs 目录
    当 运行 spec add-req 与 spec add-scenario
    那么 spec 可被解析且 resolve-req 反查一致

  @req:r41 @executable
  场景: 语义词按词边界判定
    假如 一个含单一 capability spec 的临时 specs 目录
    当 以 statement "Use MUSTARD everywhere" 运行 spec add-req
    那么 报错含 "rule keyword" 且 spec 文件零副作用

  @req:r43 @executable
  场景: resolve-req 输出 statement 与未命中报错
    假如 一个含单一 capability spec 的临时 specs 目录
    当 运行 spec add-req 后对该 req 运行 spec resolve-req
    那么 输出含该 capability 与完整 statement
    当 对不存在的 req 运行 spec resolve-req
    那么 报错且退出码非零

  @req:r43 @executable
  场景: dedupe dry-run 零副作用
    假如 一个两个 spec 含相同 rN 的临时 specs 目录
    当 运行 project dedupe-req-ids --dry-run
    那么 输出含重映射计划且两个 spec 文件零副作用

  @req:r41 @executable
  场景: add-req 目录式布局自动发现
    假如 一个目录式布局的临时 specs 目录
    当 运行 spec add-req 指向该 capability 与指向不存在的 capability
    那么 规则场景追加进目录式主文件且无扁平文件被创建
    而且 不存在的 capability 报错且零副作用

  @req:r42 @executable
  场景: add-scenario 目录式布局自动发现
    假如 一个目录式布局的临时 specs 目录
    当 运行 spec add-scenario 指向该 capability 存在的 req
    那么 验收场景追加进目录式主文件且无扁平文件被创建

  @req:r43 @executable
  场景: dedupe 重映射冲突
    假如 一个两个 spec 含相同 rN 的临时 specs 目录
    当 运行 project dedupe-req-ids
    那么 后一个文件的 rN 被重映射为空闲 id
