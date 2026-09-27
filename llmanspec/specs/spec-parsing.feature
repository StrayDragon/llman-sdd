# language: zh-CN
# capability: spec-parsing
# purpose: 定义 .feature 单轨解析的语言兜底链、头注释契约、标签分层语义与全局 rN 注册表。
# scope: packages/core/src/spec/

功能: spec-parsing

  @req:r7
  规则: 解析语言兜底链
    .feature 解析 MUST 以 en 匹配器起步(`# language:` 头自动生效),失败后 MUST 回退 zh-CN 匹配器再试,仍失败才报错。config locale
    zh-Hans MUST 映射为 gherkin 语言代码 zh-CN,其余 locale 透传;`spec skeleton` 生成的 `# language:` 头 MUST
    经该映射派生(不得另行硬编码)。

    场景: 语言兜底链与 locale 映射
      假如 一个无语言头使用中文关键字的 feature 内容
      当 依次以 en 与 zh-CN 匹配器解析该内容
      那么 en 起步失败回退 zh-CN 解析成功
      而且 纯 en 内容以 en 匹配器起步成功
      而且 双匹配器均失败才报错
      而且 locale zh-Hans 映射为 zh-CN 且其余透传


    场景: skeleton 语言头经映射派生
      假如 一个 locale 为 zh-Hans 的已初始化临时仓库
      当 运行 spec skeleton demo-cap
      那么 生成的 spec 首行为 "# language: zh-CN" 且规则体使用中文
      当 在 locale 为 en 的已初始化临时仓库运行 spec skeleton demo-cap
      那么 生成的 spec 首行为 "# language: en"

  @req:r8
  规则: 头注释契约
    每个 capability .feature MUST 以 `# capability:` 头注释开始;`# purpose:` 与 `# scope:` MUST 同样存在;三者构成
    CapabilityDoc 头部,缺失项 MUST 被逐项报告。

    场景: 头注释缺失逐项报告
      假如 一个缺失全部头注释的 feature 内容
      当 解析该 feature
      那么 错误逐项报告三处缺失头注释

  @req:r9
  规则: 原生分层解析语义
    .feature MUST 按 功能→规则→场景 原生分层解析:`规则:` 块的标题与描述(自由文本)+ `@req:<id>` 句柄(块头标签)进 RuleIR,
    块内嵌套 `场景:` 进该规则的 scenarios(步骤原样);不在任何 `规则:` 内的顶层 `场景:` 为功能级示例(Gherkin 原生允许,无规则句柄、
    不参与规则统计;官方解析器下首个 `规则:` 之后的顶层场景会被并入该规则,即其功能级归属);规则描述 MUST/SHALL 词不强制。
    历史标签 `@human/@rule/@executable/@manual` 惰性——解析不赋予语义、不报错(旧文件以 `spec migrate-native` 迁移)。

    场景: 中文 feature 解析为 IR
      假如 一个使用中文关键字的 feature 内容
      当 解析该 feature
      那么 IR 含带描述与嵌套场景的规则块且 req 句柄为 r9
      而且 该规则块内嵌套场景步骤按关键字保留


    场景: 历史标签惰性与原生结构
      假如 一个含 `规则:` 块与嵌套场景、且带历史 @human/@executable 标签的 feature 内容
      当 解析该 feature
      那么 解析不报标签语义错误
      而且 规则块与其嵌套场景按结构进入 IR

  @req:r10
  规则: 全局 rN 注册表
    跨全部 specs 的 @req:rN MUST 构成全局唯一注册表;重复 id MUST 被报告且报告 MUST 含冲突文件对。

    场景: 重复 req id 被发现
      假如 两个 spec 文件都含 @req:r99 标签
      当 构建全局注册表
      那么 报告包含重复对 r99

  @req:r65
  规则: 迁移保留规则场景自身步骤
    `spec migrate-native` 渲染规则块时,legacy 规则场景(@req + @rule/@human)自身解析出的验收步骤 MUST 合成为该规则块内的自动嵌套 `场景: 验收示例`(紧跟描述行之后、既有归属验收之前),步骤关键字与文本 MUST 原样保留,不得静默丢弃;该自动嵌套场景 MUST 计入迁移摘要的 scenario 计数。带 @skip 的规则场景,其自动嵌套场景 MUST 继承 @skip。

    场景: 描述与步骤同体的规则场景迁移保留步骤
      假如 一个「描述与验收步骤同体」的 zh-CN legacy feature 内容
      当 迁移该 feature 为原生格式
      那么 迁移产物为含自动嵌套场景的规则块且步骤关键字序列原样保留
      而且 迁移产物以官方解析器解析无错误
      而且 摘要计数含该自动嵌套场景

    场景: 带 @skip 的同体规则场景迁移继承跳过
      假如 一个带 @skip 的「描述与验收步骤同体」legacy feature 内容
      当 迁移该 feature 为原生格式
      那么 自动嵌套场景带 @skip 标签

  @req:r88
  规则: 迁移输出方言一致并强制解析自检
    `spec migrate-native` 的迁移产物 MUST 与源 feature 的解析方言一致(`# language:` 头或语言兜底链定方言):zh-CN 源输出 `规则:`/`场景:`、en 源输出 `Rule:`/`Scenario:`,自动嵌套验收场景标题同步本地化(验收示例 / Acceptance example),preamble 原样保留。迁移完成前 MUST 以官方解析器对产物做解析自检,自检失败 MUST 返回错误而非产出内容(dry-run 同样受检),不得静默写入不可解析的文件。

    场景: en 方言 legacy 迁移保持方言一致
      假如 一个 `# language: en` 的「描述与步骤同体」legacy feature 内容
      当 迁移该 feature 为原生格式
      那么 迁移产物使用 en 关键字且以 en 解析器解析无错误
      而且 自动嵌套验收场景标题为 Acceptance example

    场景: zh-CN 方言迁移输出保持中文关键字
      假如 一个 zh-CN 的两体 legacy feature 内容(规则场景与归属验收分离)
      当 迁移该 feature 为原生格式
      那么 迁移产物仍使用中文关键字且解析无错误
