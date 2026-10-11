# v0.7 → v0.8 迁移指引：proposal frontmatter `title` 必填门

0.8.0 包含两类变更：**`title` 成为 proposal frontmatter 必填字段**（破坏性——validate 直接
ERROR，无过渡期）与**冻结平铺卡格式转单文档纯 YAML**（新卡不再带 `---` 围栏）。

## 变更内容

### 破坏性：frontmatter `title` 必填（validation r99，合法字段集 r64 扩为七字段）

- 活跃 change 的 `proposal.md` frontmatter 必须携带非空 `title`：一句话概念式人类可读标题，
  不得复读 change id。缺失或空串 → `llman-sdd validate` 直接 ERROR。
- 谁受影响：**所有存在活跃 change 的仓库**——升级后首次 `validate` 会把缺 title 的活跃
  change 报红。
- 为什么改：title 此前的机器来源是正文 H1，骨架模板不含 H1、skills 指引只是建议，实测
  约 1/3 的 proposal 缺 H1，冻结后卡片 title 为空（本仓库 71 张卡 11 张空）。frontmatter
  是 validate 已有字段门可强校验的结构。
- 升级动作：在仓库根执行一次性脚本（幂等，已有非空 title 的 change 自动跳过；取值优先
  正文 H1，无 H1 落 `TODO` 占位）：

  ```bash
  bash <llman-sdd 检出路径>/migrations/v0.7-v0.8/backfill-title.sh
  ```

  或手动为每个活跃 change 的 proposal frontmatter 补一行（放在 `depends_on` 旁）：

  ```yaml
  ---
  depends_on: []
  title: 一句话概念式标题
  ---
  ```

- 版本互斥提示：0.7.x 把 `title` 当未知字段拒绝、0.8.0 起必填——升级 0.8.0 并 backfill
  之前，同一仓库不要在两版间来回切换（`title` 字段两版互斥是合约变更固有代价，收敛路径
  是一次性升级 + backfill）。

- `change new` 骨架自 0.8.0 起预填 `title: TODO` 占位（非空、直接过门），充实 proposal 时
  改写即可。
- `changes/archive/` 下的 proposal 免检，归档目录无需动作。

### 格式变更：冻结平铺卡转单文档纯 YAML（review-freeze r24）

- `archive freeze` 新写的 `<YYYY-MM-DD>-<id>.yaml` 卡不再带 `---` 围栏，内容为
  `title` + `depends_on` 两键的纯 YAML，单文档解析器（如 `YAML.parse`）可直接消费。
- 卡 title 取值：proposal frontmatter 的 `title` 非空时优先，否则回退正文 H1。
- 存量卡兼容：**无需任何动作**。graph 读取卡内 `depends_on` 时双格式兼容（存量围栏卡
  照常解析，不要求迁移）；存量空 title 卡不补救（正文在 7z 冷备与 git 历史中可查）。

## 一键检查

```bash
# 找出所有会被新门打红的活跃 change（frontmatter 缺非空 title）
grep -rL '^title: ..' --include='proposal.md' lllmanspec/changes/ 2>/dev/null | grep -v archive
```

补齐 title 后 `llman-sdd validate --all --strict` 恢复全绿即完成迁移。
