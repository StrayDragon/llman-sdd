# language: zh-CN
# capability: config-schema
# purpose: 定义 llmanspec/config.yaml 的字段契约、校验行为与 schema artifact 漂移门禁。
# scope: llmanspec/config.yaml, packages/core/src/config/, scripts/gen-schema.ts, artifacts/

功能: config-schema

  @req:r5 @human
  场景: 顶层字段域
    - llmanspec/config.yaml MUST 位于项目根 llmanspec/ 目录;顶层字段 MUST 仅由 schema/locale/extra_skills/archive/bdd/sdd/change_id 组成,未知字段 SHALL 宽松放行(不报错)。schema 字段必填且 MUST 为 "spec-driven"。extra_skills 取值域 MUST 限于 llman-sdd-continue/llman-sdd-ff/llman-sdd-validate/llman-sdd-arch-review/llman-sdd-wayfinder/llman-sdd-research。bdd 段 MUST 仅由 framework/run_command/verify_prompt 组成(bindings 键已不消费,旧配置残留该键 SHALL 被宽松剥离,解析结果不含该键)。bdd 段 MUST NOT 声明无消费方的字段(default_language、feature_dir 已移除),旧配置残留这两个键 SHALL 被宽松忽略(与未知字段同口径,解析结果不含该键)。

  @req:r5 @executable
  场景: 顶层字段域与未知字段宽松
    假如 一个含全部顶层字段与未知字段的 config 内容
    当 加载该 config
    那么 加载成功且未知字段宽松放行
    而且 schema 非法值报错

  @req:r5 @executable
  场景: 遗留已删除的 bdd 键被宽松剥离
    假如 一个 config 内容 bdd 段含已删除的旧键
    当 加载该 config
    那么 加载成功且解析结果的 bdd 段不含未经声明的键

  @req:r5 @executable
  场景: bdd 段已移除字段被宽松忽略
    假如 一个 config 内容 bdd 段含 default_language 与 feature_dir
    当 加载该 config
    那么 加载成功且解析结果的 bdd 段不含 default_language 与 feature_dir

  @req:r6 @human
  场景: 校验失败报告与 artifact 漂移门
    - config 校验失败 MUST 报错且错误明细 MUST 截断至前 5 条;locale 缺省 MUST 为 "en"。schema artifact(artifacts/schema/configs/en/llmanspec-config.schema.json)MUST 可由 zod schema 确定性再生成,漂移 MUST 被 gen-schema --check 以非零退出码拒绝。

  @req:r6 @executable
  场景: 非法配置被拒绝
    假如 一个 config 内容 extra_skills 含 "llman-sdd-unknown"
    当 加载该 config
    那么 报错信息包含 "extra_skills"
    而且 报错条数至多 5

  @req:r6 @executable
  场景: schema artifact 漂移被 check 拒绝
    假如 一个复制到临时目录的 schema artifact 副本
    当 以该副本路径运行 gen-schema --check
    那么 check 退出码为 0
    当 篡改该副本后再次以其路径运行 gen-schema --check
    那么 check 退出码非零
    而且 仓库内 schema artifact 未被修改

  @req:r59 @human
  场景: change_id pattern 契约
    - config `change_id.pattern` MUST 在加载期编译校验(非法正则 MUST 报错;该编译 MUST 由 core 配置加载完成,读取配置的所有命令路径均受其约束);pattern 的强制点 MUST 为 validate 的 change 域(对活跃 change 目录名违反 pattern 者判 ERROR,归档/legacy 不回溯,与 v1 一致);`change new` 对显式 id 与派生 id MUST NOT 因 pattern 拒绝;pattern 缺省 MUST 为宽松 kebab 兼容(等价 ^[a-z0-9][a-z0-9-]*$)。

  @req:r59 @executable
  场景: pattern 在 validate 域强制
    假如 一个配置了纯数字前缀 pattern 的临时仓库
    当 创建不匹配的 change 并运行 validate
    那么 该 change 判 ERROR 且报错含 "change_id.pattern"

  @req:r59 @executable
  场景: 非法 pattern 加载即报错
    假如 一个 config 内容 change_id.pattern 为 "[unclosed"
    当 加载该 config
    那么 报错信息包含 "change_id.pattern"
