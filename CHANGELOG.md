# Changelog

本项目遵循语义化版本（SemVer）。breaking 变更随大版本/次版本标注迁移说明。

## 0.3.1 (2026-09-19)

修复 0.3.0 的发布缺陷：升版本号时未刷新 `bun.lock` 的工作区版本，`bun publish`
把 `@llman-sdd/cli@0.3.0` 的依赖解析为 `@llman-sdd/core@0.2.0`，导致 npm 安装的
CLI 启动即崩（`loadTreeWithAutoRebuild` 导出不存在）。**npm 上的 0.3.0 请勿使用**；
v0.3.0 的 GitHub 单二进制产物不受影响（源码内嵌，不经 npm 依赖解析）。

0.3.1 将工作区版本对齐并刷新 lockfile，`@llman-sdd/cli@0.3.1` 依赖
`@llman-sdd/core@0.3.1`。功能内容与 0.3.0 完全一致，见下方 0.3.0 条目。

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

### 新增

- **change id 前缀解析**（v1 r112 对齐，r61）：`show`、`validate <item>` 与
  `change start/attach/diff/finalize/archive` 支持唯一前缀解析（如 `c2805` →
  `c2805-update-todo-llm-api`），人读输出向 stderr 打 `'input' -> 'resolved'
(prefix match)` 提示；多前缀命中报错列候选；`--json` 的 `matchedViaPrefix`
  如实上报；大小写敏感；graph 种子保持自有解析（含归档兜底）。
- **context 索引懒刷新**（v1 r97 对齐，r62）：索引 missing/corrupted/stale 时检索前
  自动 rebuild 一次（零 LLM），不再仅因索引缺失返回 unavailable；重建失败输出
  `errorKind=index_rebuild_failed` 的 JSON error。
- **validate 完整性 WARNING**（v1 r1 对齐，r63）：stage=full 已绑定但 specs 未 landed
  时报带 skill 引导的 WARNING（propose 落 specs / 勿重跑 start / apply 看
  readyToImplement）；默认分支上 `llmanspec/specs/` 有未提交改动时报 WARNING 指引
  切到绑定分支。均不阻断（`--strict` 按既有升级语义）。
- **proposal frontmatter 合法字段集**（v1 r124 对齐，r64）：depends_on / blocks /
  branch / base_branch / base_sha / needs_specs_change 六字段；合法集外字段报 ERROR。
  合同化既有实现，行为不变。

### 行为变更

- `change finalize` 现校验「当前分支 == binding.branch」，不满足在任何写入前报错
  （v1 r94 对齐；此前任意分支执行会强制切分支收口）。
- validate 对无 `@req` 链接的孤儿 `@executable` 验收场景报 WARNING（v1 r132 对齐，r65）。
- `review` 的 `warningCount` 合同措辞修正为 pending/unbound/stale 三类信号之和
  （实现口径不变，v1 对齐）。
- `# scope:` 路径缺失的严重级别合同措辞修正为 `--strict` 下 ERROR、否则 WARNING
  （实现口径不变，v1 r42 对齐）。

### 其它

- skills 模板（validation-hints / feature-contract 单元）同步更新；消费仓可运行
  `llman-sdd init --update` 重渲染 skills。
- `llmanspec/AGENTS.md` 回填 Change Proposal Frontmatter SSOT 章节与锁定哈希门禁
  裁剪的范围决策补记。
