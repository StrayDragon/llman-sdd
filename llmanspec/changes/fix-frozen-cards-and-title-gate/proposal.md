---
depends_on: []
---

# 冻结卡纯 YAML 化与 proposal title 必填门

## Why

实测（2026-10-11 复现，现场已还原）暴露 `archive freeze` 平铺卡两个缺陷：

1. **卡不是可直接消费的 YAML**。卡文件扩展名 `.yaml`，内容却是 `---` 围栏的
   markdown-frontmatter 风格（`composeFrozenCard` 输出 `['---', title, depends_on, '---']`）。
   尾部 `---` 构成第二个空文档，`YAML.parse` 抛
   `Source contains multiple documents`——标准单文档 YAML 读取器无法消费。围栏是让
   `extractFrontmatter`/`parseDeps` 零改动继续工作的历史包袱（graph r54 冻结卡回退靠它读
   `depends_on`），代价外移给了所有 YAML 消费者。
2. **title 提取依赖正文 H1，缺 H1 即空**。title 唯一来源是 `firstH1(proposal)`，proposal
   正文无 H1 时卡片落 `title: ""`：存量 50 卡中 4 张、本轮 21 张新卡中 7 张为空（合计
   71 卡 11 张，约 15%）。根因链：`DRAFT_PROPOSAL_TEMPLATE` 骨架不含 H1；skills 模板
   "H1 用人类可读标题"只是建议；validate 无 H1 门。H1 是自由正文，靠建议约束 agent 的
   遵从率只有约三分之二。

现行 SSOT 方向相反：`llmanspec/AGENTS.md` "Change Proposal Frontmatter SSOT"（r64）把
`title` 列为 frontmatter 非法字段。本变更把 title 的权威位置从正文 H1 迁到 frontmatter
字段——frontmatter 是 validate 已有字段门可强校验的结构，H1 不是。

## What Changes

- **卡纯 YAML 化**（r24 修订）：`composeFrozenCard` 去掉首尾 `---` 围栏，卡为单文档纯
  YAML（`YAML.parse` 直接可解析）；卡内容仍仅 `title` + `depends_on`。
- **title 来源反转**（r24 修订）：freeze 取 title 时 frontmatter `title:` 非空则优先，
  否则回退正文 H1（存量归档目录兼容）。
- **graph 双格式兼容**（r54 修订）：冻结卡 `depends_on` 依赖边解析同时接受新纯 YAML 卡
  与存量围栏卡；存量卡不迁移、不补救。
- **title 必填门**（r64 修订 + 新规则）：`title` 进合法字段集（七字段）；活跃 change 的
  proposal frontmatter 缺 `title` 或值为空串 → validate 直接 ERROR（不分阶段，已定）；
  `changes/archive/` 免检沿用。值约束"一句话概念式人类可读标题、不复读 change id"作为
  模板/skills 指引，不做程序判定。
- **骨架与模板同步**：`change new` 骨架（`DRAFT_PROPOSAL_TEMPLATE` 写入路径）预填
  `title:` 非空占位；zh/en skills 模板（propose/draft 等）frontmatter 指引文案同步改写
  ——中文模板遵循 STC（`../STC-Simplified-Technical-Chinese/`，强度词只用
  必须/不得/宜/不宜/可/不必/能/不能，一条一个要求），`check:stc` 基线只许下调；
  `llmanspec/AGENTS.md` SSOT 表与 H1 条款同步；golden 渲染基线更新。
- **升级路径**：破坏性合约变更（新增必填字段），写 `migrations/v0.7-v0.8/README.md`：
  升级方需为活跃 change 的 proposal frontmatter 补 `title:`；存量围栏卡无需动作（双读
  兼容）；存量空 title 卡不补救（已定，正文在 7z 冷备与 git 历史中可查）。

### 已定决策

- 存量 11 张空 title 卡：不补救。
- 活跃存量 change 兼容策略：直接 ERROR（无 WARNING 过渡期）。
- H1 与 `title:` 并存：`title:` 存在且非空则优先；H1 保留为回退来源与人类阅读习惯，不再
  是机器提取的权威。
- 本 change 自身的 proposal 在 ALLOWED_FIELDS 扩容落地后补写 `title:`（自举）。

## Capabilities

- `validation`：r64 合法字段集六→七（去掉 title 反例）；新增规则"proposal title 必填门"
  （一句话概念：活跃 change 的 proposal frontmatter 必须携带非空 `title`）。
- `review-freeze`：r24 卡格式改单文档纯 YAML；title 来源改 frontmatter 优先、H1 回退。
- `peripheral-commands`：r54 卡依赖边解析双格式兼容。
- `change-lifecycle`：`change new` 骨架预填 `title:` 占位（随 title 门规则的场景落地，
  不单开规则）。
- `init-generators`：无 spec 条款变更；skills 模板内容经既有 golden 渲染门与 r97
  check:stc 门守护。

## Impact

- 代码：`packages/core/src/archive/frozenCard.ts`、`freeze.ts`；`report/graph/deps.ts`、
  `nodes.ts`（卡读取路径）；`validation/changeCheck.ts`（ALLOWED_FIELDS + 新门）；`
  change/id.ts`（DRAFT_PROPOSAL_TEMPLATE）、`change/lifecycle.ts`（newChange 骨架）。
- 模板：`packages/core/templates/{zh-Hans,en}/skills/llman-sdd-{propose,draft}.md` 等
  frontmatter 指引处；`tests/golden/baseline/` 双语基线；`scripts/stc-baseline.json`。
- 文档：`llmanspec/AGENTS.md` SSOT 表（title 行 + H1 条款措辞）；`migrations/v0.7-v0.8/`。
- 兼容：本仓库现无活跃 change，新门落地即全绿；外部仓库升级按 migration README 操作。
- 风险：`change new` 骨架占位值若为空串会立即触门——占位必须非空（`title: TODO` 起步，
  由 agent 充实时改写）；validate 错误消息需引导补 title 而非仅报错。
