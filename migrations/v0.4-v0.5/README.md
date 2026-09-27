# v0.4 → v0.5 迁移指引：原生 Gherkin 分层规范格式

0.5.0 起，`.feature` 的**唯一规范样式**改为 Gherkin 原生分层，历史标签
（`@executable`/`@rule`/`@human`/`@manual`）不再承载语义：

```
功能: demo

  @req:r1
  规则: 需求标题
    需求描述(自由文本,多行;不以步骤关键字开头)

    场景: 验收示例
      假如 前置
      当 动作
      那么 断言
```

- 需求 = `规则:` 块(`@req:<id>` 是唯一需求句柄,挂块头标签);
- 可执行示例 = 块内**嵌套** `场景:`(默认首选);顶层 `场景:` 为功能级示例(无句柄、不告警;孤儿概念已废除);
- 无嵌套场景的规则 = 裸规则(聚合计数 + review pending 计量,交 specs-compact 压降);
- 规则描述自由文本,不再强制 MUST/SHALL 词;不再有互斥/豁免/悬空链接等旧机制。

## 升级路径

1. **迁移旧文件(必须)**:运行内置迁移工具,把标签轨 `.feature` 改写为原生分层
   (规则→`规则:` 块,验收按 `@req` 嵌套,剥除旧标签,无归属验收置于末尾作为功能级示例):

   ```bash
   llman-sdd spec migrate-native --dry-run llmanspec/specs   # 预览计划
   llman-sdd spec migrate-native --yes llmanspec/specs       # 执行(逐文件确认用不带 --yes)
   ```

   或以本目录脚本代跑: `bash migrate-spec-format.sh [specs-dir]`

2. **验证**:`llman-sdd validate --specs --strict`(结构 13 项门)与项目 BDD 套件
   (`bun test tests/bdd`)全绿为收口标准。

3. **行为差异明细**
   - `validate` 删除旧 ERROR:无 MUST 词检查、无 @human/@executable 互斥、
     无 `automatable rule is not guarded`、无悬空 @req。
   - `validate` 新增:规则缺 `@req` → ERROR;顶层 `场景:` 为功能级示例、不告警;
     裸规则 → 聚合 INFO(`--include-info` 可见)。
   - `review` 信号: pending=裸规则数;`unbound` 信号已删除。
   - 作者命令:`spec add-req` 追加 `规则:` 块(不再校验 MUST 词);
     `spec add-scenario` 向规则块插入嵌套 `场景:`;`spec skeleton` 输出原生骨架。
   - 输出口径(`--json`/TOON/退出码)、生命周期命令(`change *`/`init`/`project *`)不变。

4. 旧格式文件在 0.5 下“解析惰性”(标签无语义),但缺迁移会产生结构告警——
   请务必执行第 1 步。历史归档 change 文档中的 `@req:<id>` 引用仍然有效
   (句柄机制保留)。
