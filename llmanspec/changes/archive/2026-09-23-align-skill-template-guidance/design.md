# 设计决策:技能模板指引对齐

## D1 固化方式:禁用模式 + 必含标记门禁,不逐句钉 spec

语义对齐的正确高度不是把每句措辞写进 .feature(文本级断言脆),而是与 r67 同型的**源扫描门禁**:`tests/unit/template-guidance-parity.test.ts` 对 `packages/core/templates/**` 双 locale 源声明两类断言——

- **禁用模式(forbidden)**:`review --capability`(值域误用)、`--skip-specs` 推荐、`tasks[].test` 死引用、「no auto commit」错述、stage-guard 不可能状态短语(en/zh 各自精确短语,避免误伤合法表述,如 stage-guard 中合法的 `proposal + design + tasks` 全列表述)。
- **必含标记(required)**:4 个 context 引导文件含 `LLMAN_SDD_INDEX_CHAT_MODEL`;propose 含 `spec next-req-id` / `spec add-req` / `spec add-scenario` / `spec skeleton`;wayfinder 与 apply-cycle 含 `disable-model-invocation: true`;specs-compact 含 `project dedupe-req-ids`。

新增漂移只需增补断言条目,门禁结构不动。

## D2 authoring helpers 只进 propose 4b

propose 4b「单轨 feature 撰写」是撰写引导的自然归属;**不动** validation-hints(tag 语法节已覆盖配对规则,再加会双权威)。定位一句话:**结构化新增首选(全局 rN 分配 + 配对语法 + 写入路径自动解析),手改为逃生门**。不嵌参数表(遵守「命令参考以 CLI --help 为准」原则),只给命令名与何时用。

## D3 context 双分支统一句式

四个文件(explore/propose/apply/quick)统一改为:「先 `index check`——stale/missing → `index rebuild`(无需模型)重试;fresh 仍 unavailable(`LLMAN_SDD_INDEX_CHAT_MODEL` 未设)→ 回退 `list --specs` + 直读 `.feature`,勿循环 rebuild」。标记词 `LLMAN_SDD_INDEX_CHAT_MODEL` 进 D1 必含集。

## D4 wayfinder 与 apply-cycle 对齐手动触发语义

apply-cycle 已带 `disable-model-invocation: true` 且渲染链路(frontmatter 原样透传)已验证;wayfinder 补同键兑现其 description 声明。不改 description 本身。

## D5 specs 规则:r70 / r71 各配 @executable

- r70(指引语义对齐):模板对 CLI 的行为性指引 MUST 与实际值域/行为一致,双 locale 同语义——验收 = 执行命令 `bun test tests/unit/template-guidance-parity.test.ts` 退出 0。
- r71(authoring helpers 引导):propose 撰写引导 MUST 引入结构化新增首选与逃生门定位,双 locale 同语义——验收同上(r70/r71 共用一个门禁文件,分两条场景各自驱动,失败信息按断言条目标注来源)。

pending 基线为 0:两条 @human 均有配对,不升基线。id 分配走 `spec next-req-id`(狗粮)。

## D6 下游再生顺序

模板源 → `just golden-generate`(tests/golden/baseline)→ `llman-sdd init --update`(`.agents/skills/`,本仓库 zh-Hans + bdd config)→ `just qa` + `just golden` + `just pending-gate` 全绿。golden 基线 diff 随 change 一并提交(基线更新属预期产物面,不是回归)。

## 备选与取舍

- **逐句钉 spec**:否,脆且把 spec 降级为文案副本(D1 已述)。
- **扩展 r67 门禁抓值域**:通用值域推断(每个旗标的值域)需要 per-flag 元数据,维护面大;针对已知误用模式的黑名单 + 白名单标记性价比更高,留待真有第二类值域误用再泛化。
- **顺手修 describe 文案润色**:否,本 change 只对齐 factual 漂移与覆盖缺口,不做纯风格改写(控制 golden diff 噪音)。
