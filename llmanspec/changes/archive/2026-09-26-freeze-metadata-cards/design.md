# 冻结冷备元数据再造方案（探索稿 · 形态 A 定稿）

> 状态：探索模式草稿，未绑定 change 分支、未改动 `llmanspec/specs/**`。
> 已拍板决策：形态 A（平铺卡替换目录）、OQ-3（thaw 后移除卡）、OQ-4（存量兼容）。
> 认可后走 `llman-sdd-propose` 落成合约变更（review-freeze r24/r25 措辞需修订）。

## 1. 背景与问题

当前 `llman-sdd archive freeze`（review-freeze 能力 r24/r25）将 `llmanspec/changes/archive/<YYYY-MM-DD>-<id>/`
整体压入 `freezed_changes.7z.archived` 并**删除原目录**。其初衷是避免运行时 agent 大量查看已冻结需求导致上下文爆炸。

代价（用户反馈 + 代码验证）：

1. **frontmatter 不可低成本追溯**：YAML frontmatter 随正文一并被收进 7z，IDE/grep/脚本不 thaw 读不到。
2. **唯一 change 名无法约束**：`resolveChangeRef`（`packages/core/src/validation/changeCheck.ts`）与
   `collectArchivedNodes`（`packages/core/src/report/graph/nodes.ts`）都以 `archive/` 下的**目录名**为枚举键；
   目录被 7z 吞掉后，指向冻结 id 的 `depends_on` 从可识别 `archived` 跌入 `unknown`，graph 节点与依赖边消失，
   全库 id 集合不可枚举 → 全局唯一性无从检查。
3. **大聚合 JSON 会被 agent 整读**（用户偏好约束）：单一 manifest 文件越大越激励整份读取。

## 2. 设计目标

- **元数据可追溯**：frontmatter 无损、可按 change 粒度保留在磁盘，IDE/grep/脚本可直接访问。
- **上下文不爆炸**：正文仍进 7z 冷备；磁盘上每个冻结 change 只剩一个几百字节的卡。
- **唯一 id 可约束**：冻结卡以 `<date>-<id>.yaml` 平铺，成为「一个 change = 一个文件」的权威枚举面；全库 id 集合可枚举 → validate 可做全局唯一性门禁。
- **保留 7z 双向兼容合同**：r24/r25 的 `7z 格式自洽双向回置`不拆（正文冷备载体不变）。
- **抗 git 历史重写**：正文只存在于已提交的 `.7z` blob（HEAD 可达），不依赖历史对象。
- **拒绝大文件整读**：每 change 一个小卡，而非单一大 manifest。

## 3. 核心设计（定稿：形态 A 平铺替换）

### 3.1 目标目录形态

```
llmanspec/changes/archive/
  freezed_changes.7z.archived          # 正文冷备（不变）
  2026-01-01-old-feature.yaml          # 冻结卡：frontmatter 无损 + frozen 元信息（替代原目录）
  2026-02-01-newer-change/             # 未冻结：保持现状（正文仍在目录内）
    proposal.md …
```

关键语义：**冻结卡文件名 `<date>-<id>.yaml` 即该 change 的磁盘存在形态**——
`collectArchivedNodes` / `resolveChangeRef` / `proposalFor` 改为识别平铺 `.yaml` 条目，
全库 id 集合 = 目录（未冻结）+ 平铺 `.yaml`（已冻结），唯一性门禁在此枚举面上建立。
原目录被 7z 吞掉后的「枚举键丢失」问题由「平铺卡即键」替代解决。

### 3.2 freeze 流程（修订 r24 语义）

对每个候选目录（`YYYY-MM-DD-` 前缀、满足 before/keep-recent、且**尚未冻结**——判定：目录内无 `proposal.md` 正文，即候选是带正文的目录）：

1. 读取 `proposal.md` 的 YAML 围栏块，**逐字段原样**生成 `<date>-<id>.yaml`（见 3.3 规格）。
2. 以 `<date>-<id>/` 为顶层段把**正文文件**（proposal.md/design.md/tasks.md/specs 等）`7z a` 进
   `freezed_changes.7z.archived`。
3. 删除原目录，**仅保留 `<date>-<id>.yaml`**。

失败原子性：`7z a` 失败 → 回滚已写出卡文件、不删除原目录（卡 = 已入冷备的权威记录，
卡存在即正文必在 7z 内，靠 sha256 清单校验）。

> r24 原措辞「写入 … 并删除原目录」修订为「将正文写入冷备、生成平铺卡并**以卡替换目录**」——
> 拟走 propose 的合约变更点。

### 3.3 `<date>-<id>.yaml` 规格

- 来源：proposal.md 的 `--- … ---` 围栏内容，字段值与顺序原样（归档 proposal 不受字段门禁约束，豁免字段一并保留）。
- 额外 `frozen:` 元信息段：冻结时间戳、原目录文件清单、各文件 sha256、冷备归档名。
- 单文件几百字节；一个 change 一个卡；thaw 后删除（见 OQ-3 已定）。

### 3.4 thaw 流程（修订 r25 语义）

1. 校验 `<date>-<id>.yaml` 存在即正文必在冷备（缺失卡 → 报错并列出可用条目）。
2. 从 7z 解出 `<date>-<id>/` 正文。
3. 按卡中 sha256 校验，正文回置为 `<date>-<id>/` 目录。
4. **删除 `<date>-<id>.yaml` 卡**（卡仅服务冻结期，thaw 即回归目录形态）。

### 3.5 工具面影响（形态 A）

| 消费方 | 影响 |
|---|---|
| graph `collectArchivedNodes` | 小改：识别平铺 `<date>-<id>.yaml` 作为 archived 节点（原只认目录） |
| validate `resolveChangeRef` | 小改：把平铺 `.yaml` 卡解析为 `archived`，修复「冻结后跌入 unknown」回归 |
| graph `proposalFor` | 小改：目录缺失时读 `<date>-<id>.yaml` 展示 frontmatter |
| **全局唯一性门禁** | **新增**：validate 枚举「活动目录 + 归档目录 + 平铺卡」断言 id 全集唯一——修复 issue 2 的治理缺口 |
| freeze 候选筛选 | 小改：候选=带正文的日期目录（排除已冻结条目） |
| `freeze --list` | 改为读平铺卡枚举，**不再需要解析 7z**（可省 wasm 开销） |

## 4. 备选与取舍

| 方案 | 结论 |
|---|---|
| 保留目录、目录内命名 `<date>-<id>.yaml`（形态 B） | 枚举零改动但留 N 个文件名/目录名重复的空壳目录；否决（已拍板 A） |
| 目录内 `manifest.yaml`（形态 C） | 通用名语义错位、与「作为替代」意图不符；否决 |
| 单 JSONL 索引 | append-only 与 thaw 删行冲突；否决 |
| 弃 7z、git 专用引用（`refs/archive/frozen`） | 推翻 7z 合同 + git plumbing 复杂度，无收益；否决 |
| 正文只留 git 历史、不再冷备 | 有历史重写 + gc 风险，正是用户担心点；否决（正文仍进 7z） |

## 5. git-lfs 必要性评估（结论：现阶段不上）

- `.7z` 为压缩产物，单仓库量级对普通 blob 提交无压力；提交在 HEAD 上始终可达，天然抗重写。
- LFS 需远程服务端支持 + 每台机器安装 `git-lfs` + smudge/push 开销，与本项目自包含取向相悖。
- **触发再评估的信号**：`7z a` 原地改写同一归档 → git 会为每次 freeze 累积归档全量副本；
  若 archive 逼近远端单文件上限（如 GitHub 100MB）或 clone 体积明显膨胀，再考虑：
  (a) git-lfs；(b) 每次冻结生成带时间戳的一次性归档（更换 r24 归档命名约定）。

## 6. 风险

- **r24/r25 措辞变更**：属行为合约修改，需走 propose 并在 spec 落地；`--list` 语义变化（读平铺卡而非 7z）同样入 spec。
- **历史存量**：已有 `freezed_changes.7z.archived` 的仓库**保持兼容**（OQ-4 已定）：存量卡/目录形态按各自规则识别；
  旧冻结条目仍可 thaw 到既有目录，无迁移工具。
- **卡与 7z 一致性**：freeze 顺序（写卡 → 7z 成功 → 删目录）与 thaw 顺序（解回 → sha256 校验 → 删卡）双向保证，
  任何一步失败回滚到上个一致态。
- **枚举代码面**：形态 A 需改 graph/validate 两处枚举函数 + 新增唯一性门禁——blast radius 明确，纳入 BDD 回归保护（§8）。

## 7. 开放问题（已决议）

- ~~**OQ-1**~~：`.7z` 作为普通 blob 提交进仓库（是，保证 r24 回置与抗重写；代价见 §5）。
- ~~**OQ-2**~~：定稿卡文件名 `<date>-<id>.yaml`（直接以对应 change 名 + `.yaml` 作替代）。
- ~~**OQ-3**~~：thaw 后删除卡（不移除即回归目录形态）。
- ~~**OQ-4**~~：存量 7z 保持兼容，无迁移工具；新旧形态并存各按规则识别。

## 8. 验收口径（propose 时转 BDD 场景）

- 冻结后：原目录被 `<date>-<id>.yaml` 替换，无正文残留；thaw 后正文完整且 sha256 一致回置、卡删除（沿用 r25 自洽双向）。
- 指向冻结 id 的 `depends_on` 在 validate 中仍识别为 `archived`（回归保护：修复 issue 2）。
- 全局唯一性：活动 id 与归档/冻结 id 全集唯一（新门禁）。
- `graph --scope archived` 仍展示冻结节点（回归保护）。
- `freeze --list` 输出与平铺卡一致（读卡不读 7z）。
- 失败原子性：7z add 失败 → 不删原目录、不残留半成品卡。
- 存量兼容：旧形态条目可列表、可 thaw，与新形态并存不冲突。
