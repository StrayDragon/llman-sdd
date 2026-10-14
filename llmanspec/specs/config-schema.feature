# language: zh-CN
# purpose: 定义 llmanspec/config.yaml 的字段契约、校验行为与 schema artifact 漂移门禁。

功能: config-schema

  @req:r5
  规则: 顶层字段域
    llmanspec/config.yaml MUST 位于项目根 llmanspec/ 目录;顶层字段 MUST 仅由
    schema/locale/extra_skills/archive/specs/sdd/change_id 组成(specs 承接前代 bdd 段的 spec 验证配置角色;旧 bdd 段在兼容期经兼容提升消费,见旧配置兼容条),未知字段 SHALL 宽松放行(不报错)。schema 字段必填且 MUST 为
    "spec-driven"。extra_skills 取值域 MUST 限于
    llman-sdd-continue/llman-sdd-ff/llman-sdd-validate/llman-sdd-arch-review/llman-sdd-wayfinder/llman-sdd-research。
    specs 段 MUST 仅由 framework/check_command/verify_prompt/check_transitions 组成(语义为「整个 spec 验证」的 harness:check_command 承接前代
    run_command,支持占位符与 batch-once,由 validate 执行且缺省跳过、经 `--check` 显式执行;check_transitions 为状态流转表自动发现与校验布尔开关,见 @req:r102);specs 段 MUST NOT 声明无消费方的字段(bindings、default_language、feature_dir 已移除或归入兼容处理)。
    旧配置的 bdd 段(framework/run_command/verify_prompt)在加载期 MUST 被识别并兼容提升为新 specs 语义(run_command → check_command 字段级映射,framework/verify_prompt 同名随迁):解析结果 MUST 以 specs 呈现、旧 bdd 段内无消费方字段 SHALL 保持宽松剥离/忽略,且 MUST 向 stderr 输出 WARNING 提示改用新形。

    场景: 顶层字段域与未知字段宽松
      假如 一个含全部顶层字段与未知字段的 config 内容
      当 加载该 config
      那么 加载成功且未知字段宽松放行
      而且 schema 非法值报错


    场景: 遗留已删除的 bdd 键被宽松剥离
      假如 一个 config 内容 bdd 段含已删除的旧键
      当 加载该 config
      那么 加载成功且解析结果的 bdd 段不含未经声明的键


    场景: bdd 段已移除字段被宽松忽略
      假如 一个 config 内容 bdd 段含 default_language 与 feature_dir
      当 加载该 config
      那么 加载成功且解析结果的 bdd 段不含 default_language 与 feature_dir

  @req:r6
  规则: 校验失败报告与 artifact 漂移门
    config 校验失败 MUST 报错且错误明细 MUST 截断至前 5 条;locale 缺省 MUST 为 "en"。schema
    artifact(artifacts/schema/configs/en/llmanspec-config.schema.json)MUST 可由 zod schema 确定性再生成,漂移 MUST
    被 gen-schema --check 以非零退出码拒绝。

    场景: 非法配置被拒绝
      假如 一个 config 内容 extra_skills 含 "llman-sdd-unknown"
      当 加载该 config
      那么 报错信息包含 "extra_skills"
      而且 报错条数至多 5


    场景: schema artifact 漂移被 check 拒绝
      假如 一个复制到临时目录的 schema artifact 副本
      当 以该副本路径运行 gen-schema --check
      那么 check 退出码为 0
      当 篡改该副本后再次以其路径运行 gen-schema --check
      那么 check 退出码非零
      而且 仓库内 schema artifact 未被修改

  @req:r59
  规则: change_id pattern 契约
    config `change_id.pattern` MUST 在加载期编译校验(非法正则 MUST 报错;该编译 MUST 由 core
    配置加载完成,读取配置的所有命令路径均受其约束);pattern 的强制点 MUST 为 validate 的 change 域(对活跃 change 目录名违反 pattern 者判
    ERROR,归档/legacy 不回溯,与前代一致);`change new` 对显式 id 与派生 id MUST NOT 因 pattern 拒绝;pattern 缺省 MUST 为宽松
    kebab 兼容(等价 ^[a-z0-9][a-z0-9-]*$)。

    场景: pattern 在 validate 域强制
      假如 一个配置了纯数字前缀 pattern 的临时仓库
      当 创建不匹配的 change 并运行 validate
      那么 该 change 判 ERROR 且报错含 "change_id.pattern"


    场景: 非法 pattern 加载即报错
      假如 一个 config 内容 change_id.pattern 为 "[unclosed"
      当 加载该 config
      那么 报错信息包含 "change_id.pattern"
  @req:r102
  规则: specs.check_transitions 状态流转表自动校验开关契约
    specs 段 SHALL 支持可选布尔字段 check_transitions(缺省 false/未启用,不设嵌套对象或规则列表,开启后全自动发现所有状态流转表);非布尔值在加载期 MUST 报错且错误信息包含 specs/check_transitions;JSON Schema artifact MUST 同步包含该字段定义。


    场景: check_transitions 布尔配置解析与非布尔值被拒
      假如 一个分别配置 specs.check_transitions 为 true、false、未设置与非法非布尔值的 config 样本集
      当 依次加载 check_transitions 配置
      那么 布尔值与未设置加载成功且缺省为关闭,非布尔值报错包含 specs/check_transitions