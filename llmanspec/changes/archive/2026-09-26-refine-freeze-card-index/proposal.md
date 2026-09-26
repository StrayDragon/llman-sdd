---
depends_on: []
branch: sdd/refine-freeze-card-index
base_branch: main
base_sha: d133029d67984fd0e7dc36ffa04550face60cfb1
---

## Why

`freeze-metadata-cards`（已归档）引入了平铺冻结卡 `<YYYY-MM-DD>-<id>.yaml`，卡内容为
proposal frontmatter 字段原样转录 + `frozen:` 段（时间戳/文件清单/sha256）。真实环境
冻结 50 个归档验证后确认：其中绝大多数字段**没有任何程序消费方**——

- `branch` / `base_branch` / `base_sha` / `blocks` / `needs_specs_change` 等 frontmatter
  转录：graph 只读 `depends_on`（[deps.ts](packages/core/src/report/graph/deps.ts)），
  `--list`/唯一性门禁只读**文件名**；这些字段纯属"历史残留转录"，无功能价值。
- `frozen.at` / `frozen.archive`：无消费方（thaw 硬编码冷备名，--list 不显示时间）。
- `frozen.files.*.sha256`：仅供 thaw 完整性校验，但它把卡从"索引"拖向"完整性快照"，
  且正文其实在 git 历史中有完整备份（双向保留），文件级哈希的边际价值低于噪音代价。

用户决策：**卡只保留 `title` 与 `depends_on`**。这让卡成为真正的人类/agent 可读的
**关系导航索引**——grep 标题即可定位某个历史 change 的用途，依赖边支撑 graph 展示，
正文在 7z 冷备按需取用。id 与 date 由文件名（`<YYYY-MM-DD>-<id>.yaml`）隐含，不重复。
现有 `firstH1`（[collect.ts](packages/core/src/change/collect.ts)）可提取 title，无需新能力。

## What Changes

- **freeze（修订 r24）**：生成卡时**只写入** `title`（提取自 proposal.md H1）与 `depends_on`
  （proposal frontmatter），不再转录其它 frontmatter 字段、不再写 `frozen:` 段。
- **thaw（修订 r25）**：移除 sha256 文件级校验（卡存在 = 正文必在冷备的权威记录语义保留，
  正文回置后删除卡不变）——thaw 不再读取文件清单。
- **卡读取面**：`proposalFor` 保持从卡文本解析（parseDeps 只读 depends_on，不依赖其它字段）；
  `--list`/唯一性门禁继续只读文件名，无变化。
- **存量迁移**：已冻结的 `<date>-<id>.yaml` 全部重新生成（thaw → 重冻结或一键重写），
  迁移后卡仅含 title + depends_on；7z 冷备内容不变。
- **不再有 `frozen` 段**：`frozenCard.ts` 的 FrozenMeta/FrozenFileEntry 移除，卡生成/解析极大简化。
- **skills/模板**：`archive-freeze-guidance.md` 更新卡格式描述并刷新 `.agents/skills`。

## Impact

- 合约：review-freeze r24/r25 修订（卡 MUST 只含 title 与 depends_on；thaw 无文件级校验）。
  - 这是**对既有 r24 的再修订**（freeze-metadata-cards 才刚落地），属行为合约变更。
- 影响范围：
  - `packages/core/src/archive/freeze.ts`（卡生成/解析、sha256 移除）
  - `packages/core/src/archive/frozenCard.ts`（schema 裁剪）
  - `packages/core/src/report/graph/nodes.ts`（proposalFor title 提取不变，确认无字段依赖）
  - spec：`llmanspec/specs/review-freeze.feature`
  - BDD/单元测试：`tests/bdd/steps/meta-foundation.ts`、`tests/unit/archive.test.ts`
- 破坏性：卡文件格式变化（去掉现有字段）——存量 50 卡需迁移；冷备 `.7z` 二进制不变。
- 风险：无（已有真实冻结样本可验证迁移；graph 依赖边依赖 depends_on 字段，保留不受影响）。

## Open Questions

- 无（用户已拍板：只保留 title 与 depends_on）。
