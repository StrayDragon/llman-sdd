# 设计备忘:drop-review-stamp-and-scope

## 决策:三本账归一

spec 关联与复核历史的承载从「手写头×2」收敛为三个既有机制,零新增手写状态:

| 需求 | 承接机制 | 现状 |
|---|---|---|
| 找到管辖某代码路径的 spec | pageindex 索引(`context/retrieve.ts`,agentic 检索) | 既有,本就不读 scope |
| 确定性 spec↔代码关联 | 测试绑定链:feature-as-spec(`specs.check_command`)下 spec 场景 → 步骤实现 → 产品代码 | 既有体系,本 change 不扩建,后续 change 再做反查工具化 |
| 复核/变更历史 | git 台账(`git log -- <spec>`,squash 流全为 `archive(sdd): <id>`,拓扑序天然单调) | 既有 |

## 否决的备选(记录防重提)

- **a/b/c 修补**(倒退检测门禁 / finalize 自动推进 / 文案改 max):三者皆保留手写状态本体,只加守护;守护本身是新门禁面,且无法解决「改正文不推进」的规则空白。根因是状态不该手写,而非缺守护。
- **d 换单调键**:重做 change↔commit 关联,迁移面更大,收益不增。
- **保留 scope 做「普通注释」**:头失去门禁后无人消费,惰性注释即债务,统一剥除。

## 输出对齐口径修订(主动 divergence 清单)

2026-09 toon-default-output 定案要求 `--json` 与前代字节一致;本 change 明示修订以下面,属合约变更而非漂移:

1. `validate` JSON 载荷去 `staleness` 键(及 item 内 staleness 附带字段,如有)。
2. `review` signals kind 集合 `{unbound, locked, validate}`,去 `stale`;`summary.warningCount = unbound 计数`。
3. `SpecSummary` 去 `validScope` 字段(机器 JSON)。
4. spec 头契约收缩:`# capability:`+`# purpose:` 必要,`# scope:`/`# reviewed-through:` 不再识别(存量行降级为惰性注释,`spec migrate-scope` 机械剥除)。

## 迁移机制

- 迁移中枢收敛于 `project migrate`:prompt 子命令按版本对输出 agent playbook(英文,步骤可执行、自检可验收,未知/畸形 version-expr 报错并列出已知对);strip-legacy-headers 子命令扫描 `llmanspec/specs/**` 删除 `# scope:`/`# reviewed-through:` 行(幂等,--dry-run,结尾后续清单)。legacy --kind 协作说明路径原样保留。
- `migrations/` 升级说明:头部格式 / JSON 载荷 / review 信号集三破坏面 + migrate 用法。
- scaffold 版本 bump 触发既有漂移 NOTE,指引 `init --update`。

## 验证与度量

- 前后对比基线在 change 分支相对 merge-base 测量(仓库规约);STALE 噪声消除属机制删除,以「review 信号不再含 stale、validate JSON 无 staleness 键」的结构断言为准,不做计数基线。
- golden:skills 模板重渲染后 `check-skills-template-render` 归一化 diff 为空;validate/review 载荷 golden 同步重录。
- 本 change 落地后 `just qa` 全绿 + `validate --all --strict` + `validate --check`。
