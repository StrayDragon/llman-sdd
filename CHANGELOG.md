# Changelog

本项目遵循语义化版本（SemVer）。breaking 变更随大版本/次版本标注迁移说明。

## 0.3.0 (2026-09-19)

**breaking**：移除 `@manual` tag 豁免语义（never fully implemented — 三处实现互不一致，
详见 change `remove-manual-tag`）。

### 迁移说明

- spec 场景上的 `@manual` tag 不再合法：parser 现报显式迁移 ERROR
  （`tag:manual-removed`），删除该 tag 即可——`@human` 本身已承载「人工判定」语义，
  无需替代 tag。
- `review` 信号不再有 `manual` kind：kind 集合为
  `pending / unbound / stale / locked / validate` 五种；此前 `@manual` 规则同时出现在
  pending 与 manual 两桶的双计缺陷随本变更消除。依赖 manual 桶的下游脚本请改用
  pending 口径（pending = 尚无 `@executable` 验收覆盖的规则数，纯 INFO 台账，不影响退出码）。
- `show --json` / `list --specs` 的 morphology 不再含 `ruleManualCount` 字段与
  `manual` 文本列（`show` 的文本 Morphology 行同步移除 `manual=`）。
- validate coverage INFO 文案改为 `rule <id> is pending: no @executable acceptance scenario`
  （去掉从未生效的 "@manual waiver" 从句）。

升级检查：运行 `migrations/v0.2-v0.3/check-manual-tags.sh`（或
`grep -rn "@manual" llmanspec/specs/`）确认无残留。

### 其它

- skills 模板（validation-hints / feature-contract 单元）同步更新；消费仓可运行
  `llman-sdd init --update` 重渲染 skills。
