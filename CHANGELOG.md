# Changelog

本项目遵循语义化版本（SemVer）。breaking 变更随大版本/次版本标注迁移说明。

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
