---
depends_on: []
---

## Why

`llman-sdd archive freeze` 目前把 `llmanspec/changes/archive/<YYYY-MM-DD>-<id>/` 整体压入
`freezed_changes.7z.archived` 并**删除原目录**。其初衷是避免运行时 agent 大量查看已冻结需求导致上下文爆炸，
但带来三个被代码验证的缺陷：

1. **元数据不可追溯**：proposal 的 YAML frontmatter 随正文一并被收进 7z，IDE/grep/脚本不 thaw 读不到。
2. **唯一 change 名无法约束**：graph（`collectArchivedNodes`）与依赖解析（`resolveChangeRef`）都以 `archive/`
   下**目录名**为枚举键；目录被 7z 吞掉后，指向冻结 id 的 `depends_on` 从可识别 `archived` 跌入 `unknown`，
   全库 id 集合不可枚举，全局唯一性无从检查。
3. **agent 无法低成本回看历史尝试**：想看已冻结 change 只能整份 thaw，没有薄索引层。

本 change 引入「冻结元数据卡」机制：冻结后以 `<date>-<id>.yaml` 平铺卡替换原目录，卡内含
proposal frontmatter 无损副本 + frozen 元信息（时间戳/文件清单/sha256）。目录名枚举键由卡文件名继承，
graph 与依赖解析链条恢复可见，唯一 id 可凭据化，并形成可扩展的薄索引层（未来可补充更多元信息）。

设计已先行调研并定案，详见 `llmanspec/changes/freeze-metadata-cards/design.md`（形态 A 平铺替换、
thaw 后移除卡、存量兼容、git-lfs 暂不上）。

## What Changes

- **freeze（修订 r24）**：候选目录冻结时保留其 `<date>-<id>.yaml` 卡替代目录；卡 = proposal
  frontmatter 围栏内容字段值原样（归档 proposal 豁免字段门禁，非法集字段一并保留）+ `frozen:`
  段（冻结时间戳、正文文件清单、各文件 sha256、冷备归档名）；正文仍 `7z a` 进
  `freezed_changes.7z.archived`；7z add 失败回滚卡、不删原目录（卡存在 = 正文必在冷备的权威记录）。
- **thaw（修订 r25）**：校验卡存在 → 从 7z 解出正文 → 按 sha256 校验 → 正文回置为目录 → **删除卡**。
- **`freeze --list` 语义变化**：改为枚举平铺卡（不解析 7z，省 wasm 开销）。
- **graph / 依赖解析 / 唯一性**：
  - `collectArchivedNodes` / `resolveChangeRef` / `proposalFor` 识别平铺 `<date>-<id>.yaml` 为 archived 条目
    （修复「冻结后 depends_on 跌入 unknown」「冻结后 graph 节点消失」回归）；
  - validate 新增**全局 id 唯一性门禁**：活跃 change id + 归档/冻结 id 全集必须唯一。
- **存量兼容（OQ-4 已定）**：既有 `freezed_changes.7z.archived` 与新形态并存，旧条目按原规则可
  列表、可 thaw，不引入迁移工具。
- **skills/模板**：`archive-freeze-guidance.md`、`llman-sdd-archive.md` 等模板文案同步更新，并刷新
  `.agents/skills`（`init --update`）。

## Impact

- 合约：review-freeze r24/r25 MUST 措辞修订（r24「并删除原目录」→「以平铺卡替代目录」；r25 回置时删除卡）；
  `--list` 语义入 spec。
- 影响范围：
  - `packages/core/src/archive/freeze.ts`（freeze/thaw/list/候选筛选）
  - `packages/core/src/report/graph/nodes.ts`（archived 节点采集）
  - `packages/core/src/validation/changeCheck.ts`（依赖解析 + 新增唯一性门禁）
  - 对应 spec：`llmanspec/specs/review-freeze.feature`、`validation.feature`、`peripheral-commands.feature`
  - BDD 场景与单元测试：`tests/bdd/steps/*`、`tests/unit/archive.test.ts`
- 破坏性：无字段/命令移除；r24/r25 为语义修订，不属破坏性合约变更，无需 migrations。
- 风险：枚举代码面（graph/validate 两处 + 新门禁）需 BDD 回归保护；卡与 7z 一致性靠双向
  freeze/thaw 原子序列保证。

## Open Questions

- 无（探索阶段全部决策已定案，见 design.md §7；唯一性门禁级别定为 ERROR 并纳入 `--strict`）。
