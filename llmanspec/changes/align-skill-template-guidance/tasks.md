# Tasks: align-skill-template-guidance

- [ ] T1: Specs landing——init-generators.feature 新增 r68(指引语义对齐)/r69(authoring helpers 引导)双 @human 规则与配对 @executable 验收场景(id 经 `spec next-req-id` 分配);在绑定分支上 commit。
- [ ] T2: P0/P1 模板修正(双 locale en+zh-Hans):archive(review 检查点去 `--capability`/`--skip-specs` 推荐/archive 无自动提交错述/description 补收口提交)、explore+propose+apply+quick(context unavailable 双分支)、stage-guard(不可能状态措辞)、apply-cycle(`tasks[].test` 死引用)。
- [ ] T3: P2 模板修正(双 locale):propose 4b authoring helpers 引导、wayfinder `disable-model-invocation: true`、specs-compact `project dedupe-req-ids`、archive-freeze-guidance 非主检出警告、ff id 非阻塞对齐。 [blocked-by: T2]
- [ ] T4: 新增 `tests/unit/template-guidance-parity.test.ts`(禁用模式 + 必含标记,双 locale 源扫描;失败信息按来源文件+条目报出)。 [blocked-by: T2, T3]
- [ ] T5: 下游再生与全量验收:`just golden-generate` 更新基线、`llman-sdd init --update` 重渲染 `.agents/skills/`、`just qa` + `just golden` + `just pending-gate` + `llman-sdd validate --all --strict` 全绿。 [blocked-by: T1, T4]
