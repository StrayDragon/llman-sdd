# design

## d1 卡格式：单文档纯 YAML，存量围栏卡不迁移

- 新卡由 `composeFrozenCard` 直接输出 `title` + `depends_on` 两键，无 `---` 围栏；
  `YAML.parse` 单文档可解析是验收属性（单测断言）。
- 存量 50 张围栏卡**不迁移**：卡是冷备的权威记录，批量改写制造无意义的 git 噪音；读取侧
  做双格式兼容（d3）即可。存量 11 张空 title 卡不补救（已定决策，正文在 7z 与 git 历史可查）。

## d2 title 来源与优先级

- freeze 取 title：proposal frontmatter `title` 非空 → 用之；否则回退正文 H1（存量归档
  目录兼容）。两者皆缺 → 空 title（现状行为不变，不新增报错——freeze 不做门禁）。
- frontmatter 读值复用 `yaml` 包文档模型（与 `readBinding` 同风格），不手写解析。

## d3 graph 依赖边双格式兼容

- `parseDeps` 现路径：`extractFrontmatter` → 围栏内文本。卡纯 YAML 化后围栏不存在，
  依赖边会断。
- 方案：卡读取分支双格式——有围栏按现状；无围栏把整卡文本按 YAML 读 `depends_on`
  （proposal.md 永远有围栏，不受影响）。两格式解析结果等价（单测断言）。

## d4 title 必填门与骨架占位

- `ALLOWED_FIELDS` 扩为七字段；新门：缺 `title` 或空串 → ERROR（无 WARNING 过渡期，
  已定决策）。错误消息给出"补写一句话概念式标题"指引，不只报字段名。
- 骨架占位用非空 `title: TODO`（空串会立即触门）；agent 充实 proposal 时改写。
- "不复读 change id""一句话概念式"是文案指引（skills 模板/错误消息），不做程序判定——
  复读检测启发式误报率高，收益低。

## d5 模板文案与 STC

- zh-Hans 模板改写遵循 STC（`../STC-Simplified-Technical-Chinese/`）：强度词只用
  必须/不得/宜/不宜/可/不必/能/不能；一条一个要求；写清触发条件、对象、动作。
- `check:stc` 基线只许下调（r97）；golden 双语基线随模板同步重生；en 模板对应措辞
  用 MUST/SHOULD 词表（r97 同款约束）。
- `llmanspec/AGENTS.md` SSOT 表加 `title` 行（必填、agent 写入、一句话概念式），
  H1 条款改为"回退来源"措辞。

## d6 升级路径

- 破坏性变更（新增必填字段）：`migrations/v0.7-v0.8/README.md` + 一次性幂等脚本
  `backfill-title.sh`（活跃 change 批量补 title：H1 优先、TODO 兜底、已有非空跳过、
  archive 免动）；存量围栏卡与空 title 卡免动作。
- 版本互斥评估（xylitol 实例：0.7.1 视 title 为未知字段、0.8 必填，活跃 change 两版不可
  同时满足）：弃选「存量缺 title 给 WARNING」——存量/新建无法可靠区分，且 WARNING 无法
  推动修复（title 缺失根因正是纯建议约束）；互斥的反向（0.7 拒绝该字段）任何门禁软化都
  解不了，本质是发布管理问题。收敛路径：一次性升级 0.8 + 脚本 backfill，README 已写明。
- 本 change 自身 proposal 在 `ALLOWED_FIELDS` 扩容落地后补写 `title:`（自举验证）。

## d7 title 值归一化（verify SUGGESTION 落地）

- `readFrontmatterTitle` 把值内空白（含 YAML 折叠换行）归一为单空格——多行折叠标量进
  冻结卡时不再靠 YAML 行折叠保真，卡片恒为单行标量；纯空白值归一为空串 → 触 r99 门。

## 权衡记录

- 备选「保持 H1 为 SSOT + H1 门禁」：不动 frontmatter 合约，但 H1 是自由正文，agent
  遵从率实测约三分之二，门禁误伤面大；frontmatter 字段是 validate 已有强结构。弃。
- 备选「存量卡一次性迁移脚本」：可让读取侧单一格式，但迁移动作下放给所有下游仓库，
  收益（省双读 ~20 行）远低于成本。弃。
