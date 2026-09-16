# Tasks:refine-slop-qa-release

测试边界(seam)声明:全部复用既有 harness——@executable 场景走 tests/bdd runner(新增 context 步骤驱动 `runContextRetrieval` 的 `fetchImpl` 注入口,不发明新 seam);重构回归走 tests/unit + tests/integration + 四道 golden 门;CLI 行为走 domain 步骤的子进程 spawn。

- [x] T1 `r28` 检索去重落地(契约切片)
  - Specs landing:context-index.feature 新增 r28 `@human`(跨档 direct 胜出/同档首见/summary 去重后计数)+ `@executable` 场景(mock 模型最终回答含跨档重复)
  - `packages/core/src/context/retrieve.ts`:parseTiers 后去重(跨档保留 direct、同档保留首见),tierDirect/tierRelated/unrelatedCount 按去重后计算
  - 测试:unit 去重语义(含同档重复、跨档重复、无重复三态);BDD `tests/bdd/steps/context.ts` 新增 mock-fetch 注入步骤并跑绿 r28 场景
  - 门:qa + bun test 全绿,`golden:check`/`golden:cli` 不受影响(context 不在 golden 对照面)

- [x] T2 `r29` 输出汇总与降级契约对齐 [blocked-by: T1]
  - Specs landing:context-index.feature 新增 r29 `@human`(summary 成功形状 8 字段/readRecommended=direct id 序列/quality 值域 agentic|unavailable/轮耗尽降级 agentic+截断注记/失败 summary `{totalSpecs:0,error:true}`/stdout=结果 stderr=进度)+ 两个 `@executable` 场景(轮耗尽、HTTP 500)
  - `packages/core/src/context/retrieve.ts`:ContextResult.summary 判别联合(成功全形状 vs `{totalSpecs:0,error:true}`);quality 值域移除 `'error'`;轮耗尽 → ok+agentic+v1 原文截断注记+空档;HTTP 失败 → unavailable+api_error+错误形状 summary
  - `apps/cli/src/main.ts` context 命令:结果 JSON 独占 stdout 审计(进度/调试走 stderr),summary 消费点适配联合类型
  - 测试:unit 更新既有 'error' 断言为对齐后语义;BDD 跑绿 r29 两场景;`check-validate.ts` 归一化不动(capture 契约已在用)
  - 门:qa + bun test + golden 四门全绿

- [x] T3 CLI io 收敛与 slop 清理 [blocked-by: T2]
  - expand-contract:`apps/cli/src/io.ts` 新建 `makeIo(root)`(fs/discovery/index 组合),main.ts 全部调用点一次性迁移,删除 makeFsIo/FS_IO/makeIndexIo
  - 移除 `packages/core/src/review/review.ts` 的 `collectReviewEntries` 及 `index.ts` 导出(确认零调用点后删)
  - golden 脚本去重:check-cli/check-validate 的 v1 spawn+归一化逻辑下沉 `tests/golden/lib.ts`
  - TODO/FIXME 审计:`specHelpers.ts`/`id.ts` 内 TODO 为脚手架模板有意内容(记录裁决不删);其余逐条处理或关闭
  - 门:qa + bun test + golden 四门全绿(纯重构,行为零变化)

- [x] T4 QA 链路工程化 [blocked-by: T3]
  - justfile 新增 `golden` 聚合入口(golden:check + golden:cli + golden:validate + freeze-compat 集成)
  - CI(`.github/workflows/ci.yml`):加入 `golden:check`(免 v1);golden:cli/check-validate 的 `cargo install llman@0.0.78` 成本结论写入本任务完成注记(默认不进 CI)
  - `scripts/smoke-context.ts`:真实 LLM 冒烟(env 守卫,`LLMAN_SDD_INDEX_CHAT_*` 缺失时干净跳过;断言 quality=agentic + summary 形状 + 去重生效);justfile 挂 `smoke-context`
  - README:capture 契约(stdout=结果/stderr=进度)工程说明
  - 门:CI 配置本地 dry-run 校验;smoke 脚本无 env 时 exit 0 跳过
  - 完成注记:`cargo install llman@0.0.78` 需 Rust 工具链 + 分钟级全量编译(估算 5-10min/次),给 TS 仓库 CI 引入双工具链成本;BDD 的 v1 依赖场景改为无 v1 环境自动跳过(活体 golden/v1 冻结),CI 跑 `bun test tests/` + `golden:check` 全绿;真实 LLM 冒烟实测 PASS(quality=agentic,direct=[validation,spec-parsing],toolCalls=5)

- [x] T5 验收设计落地 [blocked-by: T4]
  - `docs/acceptance-v2.md`:v1↔v2 全命令对照矩阵(validate/change 子命令/init/archive/review/index/context/list/show/graph/spec/project)、真实项目试点步骤(../llman worktree + v2 全流程)、已知差异清单(含 D5 Agent pid 裁决)
  - `scripts/perf-baseline.ts`:大 specs 目录 fixture 下 validate/index rebuild/context(免 LLM 路径)耗时表;实测数字记录进 acceptance-v2.md
  - 试点执行:按清单对 ../llman worktree 跑一遍 v2(证据链入 docs),验证清单本身可执行
  - 门:`docs/acceptance-v2.md` 中每条命令矩阵行都有实际执行记录;perf 数字非空
