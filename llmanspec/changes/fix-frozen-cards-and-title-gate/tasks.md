# tasks

测试边界（seam）：复用既有边界——BDD runner（`tests/bdd/`，CLI 子进程，`specs.check_command: bun test tests/bdd`）、unit（`tests/unit/` 直接导入 core 公共接口）、golden 渲染门（`tests/golden/baseline/` 双语）、check:stc 文风门；不发明新边界。

## t1 卡纯 YAML 化与 title 来源（review-freeze r24）

- [ ] T1: `frozenCard.ts` `composeFrozenCard` 去掉首尾 `---` 围栏，卡为单文档纯 YAML（`title` + `depends_on` 两键不变）；unit 断言 `YAML.parse(卡内容)` 成功且对象恰含两键
- [ ] T2: `freeze.ts` 取 title 改为 frontmatter `title:` 非空优先、`firstH1` 回退（frontmatter 读值复用 `yaml` 文档模型，与 readBinding 同风格）；unit 覆盖三形态：仅 frontmatter title、仅 H1、两者并存取 frontmatter
- [ ] T3: review-freeze.feature r24 修订：卡格式改"单文档纯 YAML（无围栏，YAML 单文档解析可用）"、title 来源改"frontmatter title 非空优先、H1 回退"；BDD freeze 场景断言更新（卡可被单文档解析、title 优先级） [blocked-by: T1, T2]

## t2 graph 卡依赖边双格式兼容（peripheral-commands r54）

- [ ] T4: 卡依赖边读取路径（`report/graph/deps.ts`/`nodes.ts` 的卡分支）同时接受新纯 YAML 卡与存量围栏卡；unit 断言两种格式的卡解析出等价 `depends_on` [blocked-by: T1]
- [ ] T5: peripheral-commands.feature r54 修订措辞（卡 `depends_on` 解析双格式兼容）；BDD graph 场景补双格式用例 [blocked-by: T4]

## t3 title 必填门（validation r64 修订 + 新规则）

- [ ] T6: `changeCheck.ts` `ALLOWED_FIELDS` 扩 `title`（七字段）；新增 title 必填门：活跃 change proposal frontmatter 缺 `title` 或值为空串 → ERROR（错误消息列出字段名并引导补写一句话概念式标题）；`changes/archive/` 免检确认不回归；unit 全覆盖
- [ ] T7: validation.feature r64 修订（合法字段集六→七、示例反例去掉 title）+ 新规则"proposal title 必填门"嵌套场景（缺 title → ERROR、空串 → ERROR、archive 免检、`change new` 骨架自带非空占位过门）；BDD 步骤绑定 [blocked-by: T6]

## t4 骨架、模板与升级路径同步

- [ ] T8: `change/id.ts` `DRAFT_PROPOSAL_TEMPLATE` 与 `change/lifecycle.ts` `newChange` 骨架预填非空 `title:` 占位（`title: TODO` 起步）；unit + BDD 骨架过门场景 [blocked-by: T7]
- [ ] T9: skills 模板与文档同步：`packages/core/templates/{zh-Hans,en}/skills/` 含 frontmatter schema 指引的文件（propose/draft 至少）改写——zh-Hans 遵循 STC 强度词表（必须/不得/宜/不宜/可/不必/能/不能，一条一个要求）；`llmanspec/AGENTS.md` SSOT 表加 `title` 行、H1 条款措辞同步；`init --update` 重渲染 `.agents/skills/`；golden 双语基线重生；`scripts/stc-baseline.json` 核查只许下调 [blocked-by: T7]
- [ ] T10: `migrations/v0.7-v0.8/README.md` 升级指引（活跃 change 补 `title:`；存量围栏卡免动作——双读兼容；存量空 title 卡不补救）；本 change 自身 proposal frontmatter 补写 `title:`（自举，ALLOWED_FIELDS 扩容后合法） [blocked-by: T7, T9]
- [ ] T11: 全量门禁：`just qa`（check + 全部测试 + skills 渲染门 + check:stc + pending + schema）与 `llman-sdd validate fix-frozen-cards-and-title-gate --strict` 在 change 分支上全绿 [blocked-by: T3, T5, T8, T9, T10]
