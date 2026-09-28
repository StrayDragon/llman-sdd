# Changelog

本项目遵循语义化版本（SemVer）。breaking 变更随大版本/次版本标注迁移说明。

## 0.6.0 (2026-09-28)

**Breaking（需迁移）**：`llmanspec/config.yaml` 的 spec 验证配置段由 `bdd:` 改名为 `specs:`，
`bdd.run_command` 更名为 `specs.check_command`；`list --specs` / `show <spec> --json` 的
morphology 字段 `ruleEnforcedCount` / `rulePendingCount` 分别改名为
`requirementBoundCount` / `requirementUnboundCount`。旧 `bdd:` 段在**兼容期**仍被识别并
自动提升为新 `specs:` 语义（加载时输出一次迁移 WARNING），兼容层计划在未来版本移除；
升级指引见 `migrations/v0.5-v0.6/README.md`。

### spec 验证收敛（breaking）

- 配置段 `bdd:` → `specs:`，字段 `run_command` → `check_command`（`framework` /
  `verify_prompt` 同名随迁）；语义从「BDD 测试」收敛为「整个 spec 验证」。旧配置自动
  兼容提升 + 一次性迁移 WARNING。
- close-out（finalize/archive）：配置了 `specs.check_command` 时对凡改动 specs 的
  change 收口前必跑（不再要求存在已绑定场景）；未配置时跳过并输出 WARNING 引导（非阻断）。

### 术语与判定统一（breaking 字段改名）

- 「绑定/未绑定」全局唯一定义为「是否含可运行（非 `@skip/@experimental`）嵌套场景」，
  review 的 `pending` 信号更名为 `unbound`；`list --specs` / `show` morphology 字段改名
  `requirementBoundCount` / `requirementUnboundCount`（旧字段名不再产出）。

### 新能力

- 新增 `llman-sdd spec unbound [--limit N]`：检索未绑定需求（含 capability、文件路径、
  句柄与描述），缺省返回 1 条 + 剩余数 + `--limit 0` 提示，供 agent 自省待实现项。
- 模板变量 `bdd_*` → `specs_*`；`init --update` 会刷新项目 `.agents/skills`。

## 0.5.1 (2026-09-28)

0.5.0 缺陷修复批次（issue #2 / #3 / #4），无 breaking，无需迁移，CLI 命令面不变；
en/zh-CN 关键字输出与 0.5.0 逐字节一致。

### `spec migrate-native` 修复

- **保留规则场景自身步骤**（issue #2）：0.4 时代「顶层 `场景:` 内同时含描述
  bullets 与 GWT 步骤」的 legacy 文件，迁移时步骤被静默丢弃（真实仓库实测净丢
  约 3090 行且 validate 全绿不可检测）。现合成为规则块内自动嵌套
  `场景: 验收示例`，步骤关键字与文本原样保留；legacy 场景带 `@skip` 时继承。
- **输出方言一致并强制解析自检**（issue #3）：en 等非 zh-CN 方言源文件迁移
  产物不再出现「en 前言 + zh-CN 规则关键字」混合方言（官方解析器两种方言都
  无法解析）；迁移产物 MUST 经官方解析器自检，失败返回 `ok:false` 不落盘
  （dry-run 同样报错），不再静默产出不可解析文件。
- **关键字词表收敛至官方 gherkin 方言表**（`@cucumber/gherkin` dialects，80
  方言）：修复 en locale 的 `spec skeleton` 产出中文步骤关键字的混合方言缺陷；
  fr 等官方方言获得正确语言头与关键字。en/zh-CN 合约关键字逐字锁定，
  输出与 0.5.0 逐字节一致。
- 源文件方言判定统一口径（`# language:` 头 → 官方匹配器兜底链 → en 兜底），
  migrate 与 authoring 命令共用同一判定。

### 同文件 `@req` 碰撞检出（issue #4）

- 0.5.0 的两道防撞门（`validate --specs --strict` ERROR 门、
  `project dedupe-req-ids --dry-run`）对**同一 `.feature` 文件内**多条规则挂
  同一 reqId 均漏报。现按「携带该 reqId 的规则条数 > 1」判重（同文件/跨文件
  均算），ERROR 门覆盖同文件碰撞；`RegistryDuplicate` 新增 `occurrences`
  字段（文件 + 规则序号 + 规则标题逐出现定位）。
- `project dedupe-req-ids` remap 计划覆盖同文件第 2+ 次出现（**首现保留，
  其余重取号**）；apply 由整串 `replaceAll` 改为出现次序定点替换，修复
  `@req:r1` 误伤 `@req:r10` 的前缀碰撞。

### 注意

存量仓库若存在同文件重复 `@req` tag（0.5.0 下 validate 全绿），升级后
`validate --specs --strict` 将报 ERROR——这是预期修复而非回归；用
`project dedupe-req-ids --dry-run` 查看重取号计划后 apply 即可。

## 0.5.0 (2026-09-27)

**breaking**：`.feature` 规范格式收束为 Gherkin **原生分层**（change 系列
`drop-orphan-concept` → `native-gherkin-format` → `readable-rule-statements` →
`dedup-human-executable-rules` + 注释对齐批次）。

- **唯一样式** = `规则:` 块（`@req:<id>` 为唯一需求句柄，挂块头标签；描述为自由
  文本需求）+ 块内**嵌套** `场景:`（可执行 GWT，默认首选）；顶层 `场景:` 为
  功能级示例（无句柄、不告警）。
- **孤儿概念废除**：validate 不再对顶层验收场景报孤儿 WARNING；review 的
  `unbound` 信号移除（信号集收窄为 `pending / stale / locked / validate`）；
  顶层场景并入 morphology 的 `featureScenarioCount`（原 `orphanAcceptanceCount`）；
  迁移工具对无归属验收按文件末尾自然排序，不再前置。
- **历史标签惰性**：`@executable`/`@rule`/`@human`/`@manual` 不再承载语义
  （解析不报错、不教学；旧文件经迁移工具剥离）。`@manual` 移除语义（v0.3）延续。
- **规则描述不再强制 MUST/SHALL 词**；不再有互斥/豁免/悬空链接等旧机制。
  裸规则（无嵌套场景）= 聚合 INFO（`--include-info` 可见）+ review pending 计量，
  交 specs-compact 压降，不做治理豁免。

### 迁移说明（详见 `migrations/v0.4-v0.5/README.md`）

- 旧标签轨 `.feature` **必须**先迁移：`llman-sdd spec migrate-native --dry-run
<specs-dir>` 预览 → `llman-sdd spec migrate-native --yes <specs-dir>` 执行
  （或 `bash migrations/v0.4-v0.5/migrate-spec-format.sh`）。规则→`规则:` 块、
  验收按 `@req` 嵌套、剥除旧标签、无归属验收转为功能级示例。
- 新增结构门（validate ERROR）：`spec must define at least one rule`、
  `rule must carry an @req:<req_id> tag`、全局重复 `req_id`。
- 作者命令原生化：`spec add-req` 追加 `规则:` 块（不再校验 MUST 词）；
  `spec add-scenario` 向规则块插入嵌套 `场景:`；`spec skeleton` 输出原生骨架。
- 输出口径（`--json`/TOON/退出码）与生命周期命令（`change *`/`init`/`graph`/
  `project *`）不变；`@req` 句柄机制（registry / next-req-id / resolve-req /
  dedupe / 条款引用）完整保留。

### 其它

- change 归档存储：50 个历史归档冻结为平铺卡 + 7z 冷备（仓库内部，下游无感知）。
- `--max-scan-depth` 缺省与边界收口（graph/review 实际生效）。
- skill 模板指引对齐批次（readyToImplement 语义归位、authoring helpers 覆盖率、
  双 locale golden 基线入守、模块依赖对账门禁 r72、门禁证据约束 r70/r80）。
- BDD 验收基线：全部规则配对可执行验收（pending 基线 0），新增 rewardkit 校验
  与测试框架、eval playbook 基座、模板 token 压缩。

## 0.4.0 (2026-09-24)

**breaking**：报告型命令（`review` / `validate` / `list` / `show` / `config skills` /
`index check`）的**缺省输出从人读文本变更为 TOON**（Token-Oriented Object Notation，
机器与 LLM 友好的紧凑编码）。变更链：`add-render-layer`（渲染层地基）→
`filter-info-issues-by-default`（INFO 级 issue 缺省过滤）→ `toon-default-output`。

其他：core 公共导出面收窄（仅内部使用的导出转私有）——无引用的死导出
（`changeExists` / `ArchiveChangeResult` / `isLegalChangeId`）删除；CLI/tests 无
外部引用的 `loadTree` / `buildDocs` / `embeddedWasmBinary` / `statusHuman` /
`relativeTime` / `skeletonContent` / `allReqIds` / `UNIT_FILES` /
`DEFAULT_SKILL_FILES` / `OPTIONAL_SKILL_FILES` / `MAX_TOOL_ROUNDS` /
`MissingUnitError` / `revParseHead` 不再经 `@llman-sdd/core` 入口 re-export
（源模块内部导出保留）。

阶段性 QA 重构（行为面仅两处已批准的文案级变化）：

- **spec id 双口径归一**：spec 条目 id 派生统一到 core 新增的
  `specIdOf(entry)`（strip 口径：`# capability:` header 优先，否则去 `.feature`
  后缀的 fileName）。此前 review/context-index tree/specs 报表/validate 走裸
  `fileName` 口径，CLI 命令走 strip 口径。唯一可见变化：capability header
  缺失（本就 ERROR 路径）时，错误消息与报告中的 id 从 `t.feature` 形态变为
  `t` 形态（如 `FAIL spec/t`、`spec \`t\`: missing ...`、review 信号与
tree.json 的 `spec_id`）。
- proposal frontmatter 块提取统一：三处内联 `/^---\n([\s\S]*?)\n---/u` 正则
  （graph deps / show needsSpecsChange / changeCheck depends_on·blocks 门）收敛到
  `change/frontmatter.ts` 新增的 `extractFrontmatter`（与原正则逐字节等价，
  经 characterization 测试钉板，含 CRLF / 无闭合 / 闭合后尾随文本 / 块内含
  `---` 行 / 空文件等病态输入，全部消费点零行为差异）；`splitFrontmatter`
  写侧契约不变，`writeBinding` 输出字节稳定。

**skill 模板指引对齐**（change `align-skill-template-guidance` + quick 收尾，含
此前 0.4.0 周期内的模板修正批次）：模板对 CLI 的行为性指引与实现全量对齐——
review 人审检查点去掉 `--capability`（值域仅 spec id）；context unavailable 修复
指引双分支（stale→`index rebuild`；index fresh 但 `LLMAN_SDD_INDEX_CHAT_MODEL`
未设→回退 `list --specs` 直读，禁止 rebuild 循环）；plain `change archive` 与
finalize 同样自动收口提交（`--skip-specs` 为 v1 no-op，不再推荐）；`readyToImplement`
语义归位（apply 入门 = specs-landed 门；其为 true 是 verify/finalize 前的完成信号，
聚合全部 gateChecks 含 tasks-done）；propose 撰写引导纳入 `spec` authoring helpers
（next-req-id / add-req / add-scenario / skeleton / resolve-req）结构化新增首选；
wayfinder 补 `disable-model-invocation`。双 locale 同语义；新增语义对齐门禁
`tests/unit/template-guidance-parity.test.ts`（禁用模式 + 必含标记，
init-generators r70/r71 配 @executable 验收）。

**core 模块依赖治理**(change `add-module-dependency-gate` + quick 批次):新增 r72 模块
依赖对账门禁(`tests/unit/module-dependency-parity.test.ts`:跨模块导入边集 vs 声明允许表,
违例与表漂移双向报出);collect 域知识(collectChanges/stageFor 等)自 report/ 搬至
change/collect,断开全部 4 组模块环(允许表收窄:change→[git]、validation 去 report);
golden 基线扩展双 locale(zh `skills/` 不动,en 平行 `skills-en/`),en 模板漂移不再能
全绿滑过。行为面零变化(288 测试 + 双 locale golden 钉板)。

### 迁移说明（详见 `migrations/v0.3-v0.4/README.md`）

- agent/LLM 消费：直接吃 TOON（省 ~40% token，`[N]{fields}` 结构护栏），或加
  `--include-info` 恢复 INFO 级 issue 全量
- 依赖旧人读文本的脚本：追加 `--output human`（唯一 v1 文本形态入口）
- 需要稳定机器面的脚本：`--json` / `--compact-json` 别名保留，输出结构与退出码
  保持 v1 字节不变（v1 parity 收窄为别名面）
- 生命周期命令（`change *` / `init` / `spec *` / `graph` / `project *`）不受影响

**breaking**（change `align-report-cli-surface`）：报告命令输出面与删除面收口。

- 报告型命令（`list` / `show` / `validate` / `review` / `index check` /
  `config skills`）输出旗标统一为共享注册的三个旗标 `--output
<toon|json|compact-json|human>`、`--json`、`--compact-json`（缺省 TOON 见上）。
  `list --changes`、全局 `--no-interactive`、`--skip-specs`、`show --output`
  的 `deltas` 修饰 token、`show --json` 的 `deltaCount`/`deltas` 字段全部移除
  （v1 兼容别名面不再保留已删除项）。
- 已移除命令面：`change checkpoint` / `change delta` / `project import` 删除；
  `graph --format` 仅接受 `mermaid`（其他值报错退出 2）。
- 错误出口统一：所有命令错误 stderr 以单一 `Error: ` 前缀渲染；用法错误退出 2
  （含未知命令 `Error: unknown command`）、域错误退出 1;`--max-scan-depth` 下限
  违规退出 2。以 `process.exitCode` 散落写入命令文件的旧模式清零。
- `--max-scan-depth` 对 review/graph 真实生效(深度 1 不发现 2 层深 change)。
- config 契约:`bdd.bindings` 键、`archive.min_completion_ratio` 删除(残留键由
  zod 按未知键宽松剥离);`spec skeleton` 不再创建仓库根 `src/` 目录,骨架
  `# scope:` 指向 `llmanspec/`。
- staleness 报告文案修正:报告制 WARNING 不再称「Spec files changed on the base
  branch」,改为「Code in this spec's scope changed on this branch but the spec
  was not updated」——语义与判定一致。

### 迁移说明（align-report-cli-surface）

- 已移除旗标/命令直接删除调用即可(commander 报 unknown option/command,退出 2);
  需要机器 JSON 面用 `--json`/`--compact-json`(兼容别名保留),已删 `deltas`/
  `deltaCount` 字段不再存在。
- `graph --format` 非 mermaid 的值改为 `graph`(缺省 mermaid,不再有第二格式)。
- tasks.md 只列实现与验证任务:收口(`change finalize` / `change archive`)是流水
  线步骤,不要再写成任务(任务门要求全部勾选;validate 会对此报 WARNING)。

**门禁证据约束**(change `codify-gate-evidence-lessons`):apply / verify / propose
skill 模板(双 locale)新增门禁证据约束——门禁结论须来自真实 harness(不以
`--no-check` 取得通过,harness 失败先查根因)、编辑与验证串行、前后对比类判据在
change 分支上测量、重构类 task 对比测试用例数;verify 要求审查者亲自复跑门禁,不采信
实现者报告(不符或 `--no-check` 证据均为 CRITICAL)。r70 必含标记随之扩展。本仓库
`golden:check` 追加自带 `.agents/skills`(`llman-sdd-` 前缀)对 golden 基线的新鲜度
比对(r80),过期时报出文件并提示 `init --update`。下游升级后 `init --update` 即获得新约束。

## 0.3.1 (2026-09-19)

修复 0.3.0 的发布缺陷：升版本号时未刷新 `bun.lock` 的工作区版本，`bun publish`
把 `@llman-sdd/cli@0.3.0` 的依赖解析为 `@llman-sdd/core@0.2.0`，导致 npm 安装的
CLI 启动即崩（`loadTreeWithAutoRebuild` 导出不存在）。**npm 上的 0.3.0 请勿使用**；
v0.3.0 的 GitHub 单二进制产物不受影响（源码内嵌，不经 npm 依赖解析）。

0.3.1 将工作区版本对齐并刷新 lockfile，`@llman-sdd/cli@0.3.1` 依赖
`@llman-sdd/core@0.3.1`。功能内容与 0.3.0 完全一致，见下方 0.3.0 条目。

## 0.3.0 (2026-09-19)

**breaking**：移除 `@manual` tag 豁免语义（never fully implemented — 三处实现互不一致，
详见 change `remove-manual-tag`）。

### 迁移说明

- spec 场景上的 `@manual` tag 不再合法：parser 现报显式迁移 ERROR
  （`tag:manual-removed`），删除该 tag 即可——`@human` 本身已承载「人工判定」语义，
  无需替代 tag。
- `review` 信号不再有 `manual` kind：kind 集合为
  `pending / unbound / stale / locked / validate` 五种；此前 `@manual` 规则同时出现在
  pending 与 manual 两桶的双计缺陷随本变更消除。依赖 manual 桶的下游脚本请改用
  pending 口径（pending = 尚无 `@executable` 验收覆盖的规则数，纯 INFO 台账，不影响退出码）。
- `show --json` / `list --specs` 的 morphology 不再含 `ruleManualCount` 字段与
  `manual` 文本列（`show` 的文本 Morphology 行同步移除 `manual=`）。
- validate coverage INFO 文案改为 `rule <id> is pending: no @executable acceptance scenario`
  （去掉从未生效的 "@manual waiver" 从句）。

升级检查：运行 `migrations/v0.2-v0.3/check-manual-tags.sh`（或
`grep -rn "@manual" llmanspec/specs/`）确认无残留。

### 新增

- **change id 前缀解析**（v1 r112 对齐，r61）：`show`、`validate <item>` 与
  `change start/attach/diff/finalize/archive` 支持唯一前缀解析（如 `c2805` →
  `c2805-update-todo-llm-api`），人读输出向 stderr 打 `'input' -> 'resolved'
(prefix match)` 提示；多前缀命中报错列候选；`--json` 的 `matchedViaPrefix`
  如实上报；大小写敏感；graph 种子保持自有解析（含归档兜底）。
- **context 索引懒刷新**（v1 r97 对齐，r62）：索引 missing/corrupted/stale 时检索前
  自动 rebuild 一次（零 LLM），不再仅因索引缺失返回 unavailable；重建失败输出
  `errorKind=index_rebuild_failed` 的 JSON error。
- **validate 完整性 WARNING**（v1 r1 对齐，r63）：stage=full 已绑定但 specs 未 landed
  时报带 skill 引导的 WARNING（propose 落 specs / 勿重跑 start / apply 看
  readyToImplement）；默认分支上 `llmanspec/specs/` 有未提交改动时报 WARNING 指引
  切到绑定分支。均不阻断（`--strict` 按既有升级语义）。
- **proposal frontmatter 合法字段集**（v1 r124 对齐，r64）：depends_on / blocks /
  branch / base_branch / base_sha / needs_specs_change 六字段；合法集外字段报 ERROR。
  合同化既有实现，行为不变。

### 行为变更

- `change finalize` 现校验「当前分支 == binding.branch」，不满足在任何写入前报错
  （v1 r94 对齐；此前任意分支执行会强制切分支收口）。
- validate 对无 `@req` 链接的孤儿 `@executable` 验收场景报 WARNING（v1 r132 对齐，r65）。
- `review` 的 `warningCount` 合同措辞修正为 pending/unbound/stale 三类信号之和
  （实现口径不变，v1 对齐）。
- `# scope:` 路径缺失的严重级别合同措辞修正为 `--strict` 下 ERROR、否则 WARNING
  （实现口径不变，v1 r42 对齐）。

### 其它

- skills 模板（validation-hints / feature-contract 单元）同步更新；消费仓可运行
  `llman-sdd init --update` 重渲染 skills。
- `llmanspec/AGENTS.md` 回填 Change Proposal Frontmatter SSOT 章节与锁定哈希门禁
  裁剪的范围决策补记。
