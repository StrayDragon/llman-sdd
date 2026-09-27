---
depends_on: []
branch: sdd/native-gherkin-format
base_branch: main
base_sha: 3db37d956f632847efa356e9e59bdd9ee13bc531
---

# 原生 Gherkin 规范格式:规则块 + 嵌套场景,移除装饰性标签

## Why

现行 spec 以 `@req:<id> @rule` / `@rule @human` / `@executable` 平铺场景 + 标签表达规则与验收,既非 Gherkin 原生分层(`规则:` 块 + 嵌套 `场景:` 本就是为了「业务规则 + 其下属示例」设计),又引入互斥/豁免/MUST 词等补丁机制,`.feature` 对人与 agent 的可读性差。2026-09-27 经三轮讨论定案:采用**原生 Gherkin 分层**作为唯一样式——`功能:` → `规则:`(描述=需求文本)→ 嵌套 `场景:`(GWT 步骤,天然可执行);`@executable`/`@human`/`@rule` 全部移除;`@req:<id>` 保留(挂 `规则:` 头标签)作为稳定句柄与跨文件引用/缩写机制,连同其注册表/唯一性/next-req-id/resolve-req 能力。

## What Changes

- **规范格式**:`规则:` 块(描述=需求文本,任意文本,无 MUST 词强制)+ 嵌套 `场景:`(可执行);顶层 `场景:` = 孤儿(WARNING);无嵌套场景的 `规则:` = 裸规则(聚合计数,并入 specs-compact 精简)。`@skip`/`@experimental` 保留用于 runner 退出。
- **引擎**:IR 结构化为 Rule{reqId,title,description,scenarios}+orphans;parser 解除 `rule:nested-scenario` 拒绝并收集嵌套;runner 展平并运行全部场景(0 步骤跳过);validate 改为结构性门(规则必带 @req、req 全局唯一、孤儿场景 WARNING、裸规则聚合计数);review/report/context/authoring/nextReqId 全部适配原生关系。
- **迁移工具**:新子命令 `spec migrate-native`(交互式 + `--dry-run`),把旧标签轨 feature 改写为原生轨(规则→`规则:`块、验收按 @req 嵌套、剥除 @executable/@human/@rule、保留 @skip/@experimental);对外通用,供使用 llman-sdd 的项目渐进迁移。
- **存量迁移**:13 个 spec 文件一次迁移(工具产出 + 逐字等价验证)。
- **模板/文档**:feature-contract/validation-hints/propose/apply/verify 全量改为原生样式教学;golden 与 `.agents/skills` 重生成;`llmanspec/AGENTS.md` 两条过时范围决策更新/移除。
- **明确不做**:不设治理豁免标记(裸规则属可程序化队列,交 specs-compact);不做原生-标签长期双轨(解析仅容忍迁移窗口内的旧文件结构,引擎目标态为原生);不改嗝格式以外的生命周期语义。

## Capabilities

- spec-parsing(IR 与解析,核心)、validation(结构性门)、review(聚合信号)、peripheral-commands(list/show 口径)、context-index(检索面)、spec-authoring(@req 机器迁至规则块)、init-generators(模板与 golden)、monorepo-structure(scope 与 BDD 契约表述)。

## Impact

- 不兼容变更(大):spec 文件格式整体转向;`@executable`/`@human`/`@rule` 语义删除;旧文件须经 `spec migrate-native` 迁移。属破坏性合约变更,提案内规划 `migrations/` 升级路径说明。
- @req 能力保留:注册表/唯一/去重/next-req-id/resolve-req/条款引用。
- 引擎与测试面大幅简化(删除互斥/豁免/MUST 词/悬空链接等分支)。

## 已定案(2026-09-27 三轮讨论)

- 无守护 ERROR → 裸规则聚合计数(review 与 validate INFO,不阻断 strict)。
- MUST 词检查不保留(规则描述任意文本)。
- 不设治理豁免;裸规则归 specs-compact 队列。
- `@executable` 移除(场景天然可执行);`@req` 保留。
- 一步到位:引擎+迁移+存量全量一个 change 收口;解析不做长期双轨。
