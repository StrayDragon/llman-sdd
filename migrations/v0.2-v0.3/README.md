# v0.2 → v0.3 迁移：移除 `@manual` tag

0.3.0 起 `@manual` 不再是合法 tag（判定语义由 `@human` 承担，waiver 从未真正生效）。

## 检查

```bash
bash migrations/v0.2-v0.3/check-manual-tags.sh
```

脚本对 `llmanspec/specs/` 做 `@manual` 残留扫描；有命中时，0.3.x 的
`llman-sdd validate` 也会以 `tag:manual-removed` ERROR 指出具体位置。

## 动作

1. 删除 spec 场景上的 `@manual` tag（`@human` 已隐含人工判定语义，无需替代 tag）。
2. 下游脚本若依赖 `review` 的 `manual` 信号或 `show --json` 的
   `morphology.ruleManualCount` 字段，改用 pending 口径：
   - review kind 集合现为 `pending / unbound / stale / locked / validate`；
   - pending = 尚无 `@executable` 验收覆盖的规则数（INFO 台账，不影响退出码）。
3. 重渲染 skills：`llman-sdd init --update`。
