# refine-freeze-card-index 设计

> 前置：freeze-metadata-cards（已归档）的平铺卡机制为基线。本 change 将其 schema
> 从「frontmatter 无损转录 + frozen 完整性段」演进为「人类/agent 可读的关系导航索引」。
> 决策已由用户拍板：卡只保留 `title` 与 `depends_on`。

## 1. 目标形态

```
llmanspec/changes/archive/
  freezed_changes.7z.archived          # 正文冷备（不变）
  2026-09-14-bootstrap-monorepo-scaffold.yaml
    # ---
    # title: <proposal.md 的 H1>
    # depends_on: [...]                  # 仅当非空；空依赖不写或写 []
    # ---
```

## 2. Schema 决策与依据（代码核实）

| 字段 | 去留 | 依据 |
|---|---|---|
| `title` | **新增** | `firstH1`（change/collect.ts）现成可提取；grep 定位历史用途的核心 |
| `depends_on` | **保留** | graph 依赖边的唯一种子（deps.ts parseDeps 只读它） |
| `branch/base_branch/base_sha/blocks/needs_specs_change` | **移除** | 无程序消费方（graph/--list/唯一性门禁均不读） |
| `frozen.at/archive` | **移除** | 无消费方；时间可由文件 mtime / git 日志覆盖 |
| `frozen.files.*.sha256` | **移除** | 仅供 thaw 校验；正文有 git 历史 + 7z 双向备份，文件级哈希边际价值低 |

## 3. thaw 语义调整

- 原（freeze-metadata-cards）：按卡内 sha256 校验正文再回置。
- 新：卡存在即正文必在冷备的权威记录语义**保留**（缺少卡 → 报错），但回置前不做文件级
  sha256 比对。正文完整性由 git 历史（未冻结时的 commit）天然保证。

## 4. 迁移策略

存量 50 张卡（2026-09-26 冻结提交 e269365）需重新生成。两条路径：

- **A. thaw → 重冻结**：`archive thaw` 全部 → 用新实现 `archive freeze` 重冻结。验证充分、
  与真实用户操作一致；成本是一次全量往返。
- **B. 就地重写**：从 git 历史（merge-base 前的 proposal）提取 title/depends_on 重写卡，
  7z 不动。快，但绕过了 thaw 路径的回归验证。

推荐 **A**：与实现改动共享验证面（新 freeze/thaw 双向都由迁移演练），且 7z 冷备本就不变，
无数据风险。路径 B 作为 fallback 记录。

## 5. 影响面

- `packages/core/src/archive/freeze.ts`：卡生成只写 title+depends_on；thaw 去掉 sha256 校验；
  `bodyShas`/`sha256Text`/`collectBodyFiles` 若仅服务于校验则删除。
- `packages/core/src/archive/frozenCard.ts`：schema 裁剪为 title/depends_on；FrozenMeta/
  FrozenFileEntry/parseFrozenCard 精简。
- `packages/core/src/report/graph/nodes.ts`：`proposalFor` 读卡文本（depends_on 解析不变），
  确认不依赖已删字段。
- `tests/`：archive 单元测试、meta-foundation BDD（freeze 卡/ thaw 卡场景）更新为新 schema。
- 模板 guidance 更新 + `init --update` 刷新 `.agents/skills`。

## 6. 不做的事

- 不新增 summary/human 描述字段（用户定为"之后可能会做"，本 change 只落到 title）。
- 不改 7z 冷备格式、不改文件命名 `<YYYY-MM-DD>-<id>.yaml`（id/date 隐含约定保留）。
- 不加新 CLI 命令或旗标。
