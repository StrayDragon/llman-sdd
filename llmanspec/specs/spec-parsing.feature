# language: zh-CN
# capability: spec-parsing
# purpose: 定义 .feature 单轨解析的语言兜底链、头注释契约、标签分层语义与全局 rN 注册表。
# scope: packages/core/src/spec/

功能: spec-parsing

  @req:r7 @human
  场景: 解析语言兜底链
    - .feature 解析 MUST 以 en 匹配器起步(`# language:` 头自动生效),失败后 MUST 回退 zh-CN 匹配器再试,仍失败才报错。config locale zh-Hans MUST 映射为 gherkin 语言代码 zh-CN,其余 locale 透传。

  @req:r8 @human
  场景: 头注释契约
    - 每个 capability .feature MUST 以 `# capability:` 头注释开始;`# purpose:` 与 `# scope:` MUST 同样存在;三者构成 CapabilityDoc 头部,缺失项 MUST 被逐项报告。

  @req:r7 @executable
  场景: 语言兜底链与 locale 映射
    假如 一个无语言头使用中文关键字的 feature 内容
    当 依次以 en 与 zh-CN 匹配器解析该内容
    那么 en 起步失败回退 zh-CN 解析成功
    而且 纯 en 内容以 en 匹配器起步成功
    而且 双匹配器均失败才报错
    而且 locale zh-Hans 映射为 zh-CN 且其余透传

  @req:r8 @executable
  场景: 头注释缺失逐项报告
    假如 一个缺失全部头注释的 feature 内容
    当 解析该 feature
    那么 错误逐项报告三处缺失头注释

  @req:r9 @human
  场景: 标签分层语义
    - 场景标签中的 @req:rN MUST 被提取为需求链接;残留 @manual tag MUST 被报为迁移 ERROR(0.3.0 起移除该 tag,判定语义由 @human 承担,不得静默忽略);@human 与 @executable 互斥,违反 MUST 被报告;@human 规则场景描述 MUST 含 MUST/SHALL 语义词。

  @req:r9 @executable
  场景: 中文 feature 解析为 IR
    假如 一个使用中文关键字的 feature 内容
    当 解析该 feature
    那么 IR 中规则场景分类为 human
    而且 req 链接为 r9

  @req:r10 @human
  场景: 全局 rN 注册表
    - 跨全部 specs 的 @req:rN MUST 构成全局唯一注册表;重复 id MUST 被报告且报告 MUST 含冲突文件对。

  @req:r10 @executable
  场景: 重复 req id 被发现
    假如 两个 spec 文件都含 @req:r99 标签
    当 构建全局注册表
    那么 报告包含重复对 r99
