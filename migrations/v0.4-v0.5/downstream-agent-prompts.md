# 下游 v1/旧格式 → 0.5.0 原生 Gherkin：自迭代 Agent 提示词资产

本资产收集 llman-sdd 0.5.0 发布后，对下游历史项目执行迁移/收敛时可整段交给
coding agent 的**自迭代提示词**（盘点 → 计划先审 → 执行 → 门禁自修 → 回归 → 收口）。
命令面与规范语义以 0.5.0 为准（`llman-sdd --help`）。

## 状态登记（2026-09-27 快照，以复查为准）

| 项目                  | 起点                   | 处置                                               | 状态                             |
| --------------------- | ---------------------- | -------------------------------------------------- | -------------------------------- |
| cz                    | 旧标签 .feature（120） | `spec migrate-native` + skills 刷新 0.5.0          | 已执行；pending 待 specs-compact |
| dapz                  | 旧标签 .feature（11）  | `spec migrate-native` + skills 刷新 0.5.0          | 已执行；pending 待 specs-compact |
| lspz                  | 旧标签 .feature（11）  | `spec migrate-native` + skills 刷新 0.5.0          | 已执行；pending 待 specs-compact |
| sqlsugar              | v1 spec.toon（8）      | 人工 toon→feature + skills 刷新 0.5.0              | 已执行                           |
| synode                | v1 spec.toon（20）     | 人工 toon→feature + skills 刷新 0.5.0              | 已执行                           |
| wisp-hand             | v1 spec.toon（16）     | 人工 toon→feature + skills 刷新 0.5.0              | 已执行                           |
| xylitol               | 旧 v2 .feature（64）   | 原生迁移 + skills 刷新 0.5.0                       | 已执行；pending 待 specs-compact |
| zirvox                | v1 spec.toon（63）     | 快照，目录已删（仅 backup bundle）                 | 不迁移                           |
| llman.old-rs-impl-sdd | v1 布局（27）          | 快照（rules/ 布局与 cargo bdd 不兼容 v2 validate） | 不迁移                           |

## 一、0.5.0 升级提示词（旧标签 .feature 项目）

原生迁移走内置工具 `llman-sdd spec migrate-native`，完整 self-contained 升级提示词
见 v0.5.0 GitHub Release 的「⬆️ 推荐升级 prompt」一节
（https://github.com/StrayDragon/llman-sdd/releases/tag/v0.5.0）。
要点：dry-run 预览 → `--yes` 执行 → `validate --specs --strict` 13/13 → BDD/CI 回归 →
结构门（至少一个 `规则:`、每条规则带 `@req:r<N>`、全局唯一）为自修终止条件。

## 二、v1 spec.toon → 原生 .feature 迁移提示词

> 已用于 sqlsugar / synode / wisp-hand（2026-09-27 执行完毕）。保留作通用模板。
> 注：0.5.0 的 `project migrate --kind toon2features` 只输出指引、不执行迁移。

```text
对 <仓库根目录> 执行 llman-sdd v1 遗留 spec.toon 格式 → 0.5.0 原生 Gherkin 的迁移，
把规格从 v1 表格格式转为当前工具唯一识别的原生分层格式。严格按序执行，
任何一步失败先停下报告，不要静默跳过。

第一步：快照与工具链
- 确认 git 工作树干净；安装/升级 llman-sdd 到 0.5.0，`llman-sdd --version` 必须为 0.5.0。
- 阅读 `llman-sdd project migrate --kind toon2features` 输出（协作指引，不执行迁移）。
- 盘点 llmanspec/specs/ 下全部 spec.toon 能力清单，确认当前 0 个 .feature。

第二步：建立全局 req_id 映射表（先于任何转换）
- 扫描全部 spec.toon 的 requirements 行。v2 的 @req 句柄只识别 r<N> 且全局唯一：
  非 r<N>（如 R-AI-001）或不满足全局唯一的旧号，用 `llman-sdd spec next-req-id` 换号。
- 建立 `旧id → 新id` 完整映射表，写入迁移 change 的 proposal/design 并提交；成对保留映射。

第三步：逐能力转换（机械转换，不改语义）
- 每个能力目录 specs/<cap>/ 新建 specs/<cap>/<cap>.feature，原 spec.toon 暂不删除。
- 文件头：# language / # capability / # purpose（= spec.toon purpose 原文）/ # scope（= valid_scope 原文）；
  功能: = spec.toon name。
- requirements 每行 → 一个 `规则:` 块：块头标签 `@req:<新id>`、`规则:` 标题 = 原 title、
  描述段 = 原 statement 全文（自由文本，MUST/SHALL 照抄，不重写不增删）。
- scenarios 每行：req_id 已定义且 given/when/then 三要素齐全 → 在该规则内嵌套 `场景:`，
  given/when/then 转 zh-CN 步骤（假如/当/那么）；`feature:false` 或要素缺失 → 逐条记录理由
  后决定补全/保留/舍弃，不得静默丢弃（决定写进 proposal/design）。

第四步：结构门自迭代（必须 13/13 全绿）
- `llman-sdd validate --specs --strict`，对每个 ERROR 就地修复重跑至全绿
  （缺 规则: 块 / 缺 @req:r<N> 标签 / 全局重复 req_id → 回第二步换号并同步映射表）。
- 每轮自修最多 3 次重试，仍不绿停下贴 validate 输出。

第五步：回归
- 运行项目现有全套测试与 CI 等价命令，全绿才收口。
- 全绿后逐能力删除 spec.toon，删除后重跑一次 validate 确认干净。

第六步：收口
- 按本仓 llmanspec/AGENTS.md 流程落地（无强制流程按能力分批提交），映射表与取舍清单一并提交。
- 报告：迁移行数/规则数/场景数、validate 全绿证据、测试全绿证据、舍弃/改写清单及理由。
```

## 三、specs-compact 提示词（压降裸规则 + 补可执行场景）

> 面向已迁移但 pending 高的项目（cz / dapz / lspz / xylitol）。模板按项目代入
> pending 热点；执行前用 `llman-sdd review` 重新测量，勿照抄过期的热点数字。

```text
对 <仓库根目录> 执行 llman-sdd specs-compact：压降 llmanspec/specs/ 的裸规则并补可执行场景，
规范行为不变。严格按序执行，任何一步失败先停下报告，不要静默跳过。

第一步：快照与盘点
- 工作树干净；`llman-sdd --version`=0.5.0；读 .agents/skills/llman-sdd-specs-compact/SKILL.md。
- `llman-sdd list --specs` 全量盘点；`llman-sdd review` 记录每个 capability 的 pending 基线；
  归档历史过大先 `llman-sdd archive freeze --dry-run` 评审后 `--before <date> --keep-recent <N>` 冻结；
  `llman-sdd project dedupe-req-ids --dry-run` 找跨能力重复 req id 与重映射计划。

第二步：产出压缩计划（给我审，不直接改）
- 按 capability 分组，对每条裸规则给出四种决策之一及理由：
  1) 转场景：描述含 GWT 可表达行为（尤其正文中"例：当…那么…"伪场景）→ 改写为嵌套 `场景:`
     （假如/当/那么），步骤绑定真实行为，语义等价不改约束强度；
  2) 保留裸规则：仅当无法程序化表达（抽象目标、架构决策、治理/人工约束），逐条注明理由；
  3) 合并：语义等价跨规则/跨能力条目，保留原 req id 或按 dedupe-req-ids 换号并列出映射；
  4) 移除：真重复且已被明确替代。
- 约束：未经替代不删规范行为；req 标题尽量稳定；可执行场景优先（r66）。

第三步：执行（改 specs 须走 change）
- 按本仓 llmanspec/AGENTS.md 流程 `llman-sdd change start` 绑定分支；无基建切 sdd/specs-compact。
- 在绑定分支上按计划逐 capability 编辑 .feature（保留头部注释与 功能:，zh-CN 步骤关键字），
  边改边提交 specs 落地。

第四步：门禁自迭代（必须全绿才收口）
- 每组改完 `llman-sdd validate --specs --strict`：缺 规则:/@req、全局重复 req_id、语法错误逐条自修重跑；
  `llman-sdd review` 的 pending 应随转场景逐项下降并与计划一致。
- 每类错误最多 3 轮自修，仍不绿停下贴 validate 输出。
- 回归：运行项目现有测试与 CI 等价命令，全绿。

第五步：收口
- `llman-sdd change finalize`（或 squash），附压缩计划与 req 映射表。
- 报告：pending 前后对比、转场景/保留/合并/移除数量与理由、validate 与测试全绿真实输出。
```

## 提示词机制要点（通用）

- **自迭代闭环**：门禁 `validate --specs --strict` 全绿是每轮自修的硬终止条件；每类错误限 3 轮，
  超限即停下交人工，不用 `--no-check` 绕过，证据须真实命令输出。
- **先映射后转换**：`@req` 只认 `r<N>` 且全局唯一；映射表/压缩计划是提交工件，不是对话记录。
- **不静默**：`feature:false`/空要素/无 GWT 场景逐条记录理由（proposal/design）；实际项目状态以
  复查（`validate` + `review`）为准，不在文档中预测。
