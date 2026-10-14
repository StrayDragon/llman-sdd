---
depends_on: []
title: 移除手工治理元数据(reviewed-through 印章与 scope 头)收敛为单一台账
branch: sdd/drop-review-stamp-and-scope
base_branch: main
base_sha: 61933aa498607aac354757c38dfd22daf5b63ab3
---

## Why

spec 头部的 `# reviewed-through:` 与 `# scope:` 都是**手工维护的派生状态副本**:前者复写"哪个 change 最后复核了本 capability"(git 历史天然可考),后者手写"本 capability 管辖哪些路径"(context 检索由 pageindex 索引承担,bdd 绑定链可作确定性补充)。手写副本无工具写入、无门禁守护,已发生真实腐烂:xylitol 仓库 2026-10-13 c2520 乱序归档将 15 个头统一倒退覆盖(c2838/c2865/c2890 → c2520),当晚需专门 change 人工修复;同日两个 change 修改 spec 正文而头不动,推进规则空白。STALE 警告与其消警机制(印章 + commit subject 引用匹配)构成双向 token 税:警告反复触发 agent 复核/误改,印章要求 agent 手写状态并维持 commit 引用纪律。本 change 移除整族手工状态,原则收敛为:**关联靠索引与测试绑定推导,历史靠 git 台账,agent 零手写治理元数据**。

## What Changes

- **删除 `# reviewed-through:` 头**:parser/ir 头部结构收缩为 capability+purpose 两字段;staleness 消警分支(reviewCoversBranch 的 commit subject 子串匹配)整体删除。
- **删除 `# scope:` 头**:parser 不再识别;validate 的 valid_scope 存在性门禁(r12 相应子句)与跨根单一归属检查(r92,纯 scope 机制)删除;spec skeleton 模板不再生成该行。
- **删除 STALE 警告链**:staleness 模块(baseRef 探测、分支 diff、scope 匹配、reviewAcked)随消费者一起退役;`review` 信号集收缩(unbound/locked/validate,去 stale);`validate` JSON 载荷去 `staleness` 键。
- **报告字段清理**:`SpecSummary.validScope` 删除(全仓零消费者,已核实);review 聚合口径相应收缩(warningCount = unbound 计数)。
- **输出对齐口径修订**(主动 divergence,修订 2026-09 toon-default-output 定案的"前代字节一致"约束面):validate/review 的 `--json` 载荷去除 staleness 相关键与 stale 信号,属本 change 明示的合约变更,非漂移。
- **迁移中枢 `project migrate`**:`prompt --version-expr '<from>-><to>'` 输出面向 agent 的迁移手册(步骤+自检清单,用户可照单验收);`strip-legacy-headers` 承接机械剥除(幂等,`--dry-run`);裸调用总览追加已知版本对。本仓 specs 随本 change 自举迁移(dogfood)。
- **迁移文档**:`migrations/` 下按仓库惯例落升级说明(破坏性合约变更:头部格式、JSON 载荷、review 信号集变更)。
- **skills 文案更新**:删除 review-stamp unit 及其在 apply/verify skill 的注入;`init --update` 后下游 skill 不再教授印章写入。

随本 change 落地:`llmanspec/specs/**` 相应条款修订(r8 头契约收缩、r12/r92/r23/r33/r74 等口径改写)。

## Capabilities

- `specs/spec-parsing`——头注释契约收缩(r8)
- `specs/validation`——scope 门禁移除、JSON 载荷收缩(r12/r47 口径、r92)
- `specs/review-freeze`——信号集收缩(r23/r33)
- `specs/peripheral-commands`——skeleton 头注释、show/list 口径核对
- `specs/init-generators`——模板与 skills 渲染产物
- `specs/cli`——`spec migrate-scope` 命令面

## Impact

- 破坏性:下游存量 spec 的 `# scope:`/`# reviewed-through:` 行变为惰性注释(解析器本就跳过未知头,零迁移强制);`validate --json`/review 信号消费方需按新载荷适配。
- 行为收益:validate/review 不再产生 STALE 类噪声;agent 工作流中不存在任何需手写的治理状态;单调性/倒退/引用纪律问题族随载体消失。
- 关联判定职责移交:context 检索(既有 pageindex 索引)+ 测试绑定链(既有 `specs.check_command` / feature-as-spec 体系)。

## Followups(不在本 change 内)

- 收口阶段"scope 蔓延提醒"(finalize 单行 note,经测试绑定反查触发)——绑定反查机制落地后另起 change。
- harbor 前后回归评测:构造带 bdd 绑定 spec 的种子仓,对比改造前后 context 命中与 agent token 消耗。
