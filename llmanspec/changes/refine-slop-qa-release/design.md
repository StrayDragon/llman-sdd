# Design:refine-slop-qa-release

## D1 检索去重裁决:direct 胜出(非 v1 透传)

实测(Ornith-1.5-35B,../llman 27 specs)同一 spec 会同时落入 direct 与 related。v1 `retrieve.rs::parse_final_answer` 对模型返回的 direct/related 数组**原样透传**,无任何去重;`mod.rs` 的 `unrelatedCount` 用 `saturating_sub` 兜底负数——透传是事故性行为,不是合约(无任何 v1 spec 条款约束它)。

裁决:v2 MUST 去重——跨档重复时保留 direct 档条目、从 related 移除;同档重复保留首见;`tierDirect/tierRelated/unrelatedCount` 在去重后计算。依据:① 去重是严格改进,summary 计数才自洽;② `golden:cli` 不覆盖 context(LLM 非确定),无 parity 冲突;③ v1 侧未来也可反向采纳。

## D2 错误/降级契约对齐 v1

v1 证据:`mod.rs:202`(成功含截断均 `quality:"agentic"`)、`mod.rs:237-243`(一切失败 `quality:"unavailable"` + `summary:{totalSpecs:0,error:true}`)、`retrieve.rs`(轮耗尽返回 `truncated` 输出 → agentic + 注记 + 空档)。v1 quality 值域只有 `{agentic, unavailable}`。

v2 现状偏差:错误路径 `quality:'error'` + 全形状 summary。裁决:v2 对齐——
- 循环耗尽 → `ok:true, quality:'agentic'`,qualityNote 为截断注记(v1 原文 "agentic loop hit the 12-round tool-call limit; result may be incomplete"),direct/related 空,summary 全零全形状;
- HTTP/网络失败 → `ok:false, quality:'unavailable', errorKind:'api_error'`,summary `{totalSpecs:0,error:true}`;
- model 未设 → `unavailable`(v2 已对齐,不变)。
- `ContextResult.summary` 类型改为成功全形状与错误形状的判别联合;`'error'` 从 quality 值域移除(内部类型变更,非导出 API 破坏)。

## D3 golden 门 CI 化评估

依赖事实:`tests/golden/lib.ts:38` 直接 spawn PATH 上的 `llman`(v1)。
- `golden:check`(skills 渲染 vs 已提交基线)**免 v1** → 进 CI;
- `golden:cli` 与 `check-validate.ts` **需 PATH v1** → `cargo install llman@0.0.78` 需全量 Rust 编译(分钟级,且 CI 需 cargo 工具链)。
裁决:CI 只加 `golden:check`;v1 依赖门留在本地 justfile 统一入口,`cargo install` 成本评估结论记录于 tasks 完成注记,供 release change 复评(若有缓存方案可低成本反转)。

## D4 CLI io 适配器收敛

现状:`apps/cli/src/main.ts` 三套并存——`makeFsIo(root)`(FsIo 工厂)、`FS_IO`(DiscoveryIo 常量)、`makeIndexIo(root)`。裁决:收敛为 `apps/cli/src/io.ts` 单一模块,导出 `makeIo(root)` 返回组合对象(fs/discovery/index),main.ts 全部调用点迁移,旧三套删除。纯机械重构,expand-contract 单切片完成(调用点集中在一个文件)。

## D5 Agent pid 噪声裁决:不移植

`index check` 锁清理时 v1 会打印存活 pid 检测细节,真实环境下 pid 噪声因机器而异(实测 worktree 验证时出现)。裁决:环境噪声,不移植、不进 golden 归一化;在 `docs/acceptance-v2.md` 的已知差异清单记录。

## D6 capture 契约:stdout=结果,stderr=进度

QA 采集契约(v1 行为):结果 JSON MUST 走 stdout,进度/调试信息 MUST 走 stderr。固化进 context-index spec(r29 条款)+ README 工程说明;`check-validate.ts` 已按此归一化(注释为证),context 命令实现按此审计。

## D7 验收清单与性能基线的落点

`docs/acceptance-v2.md`(repo 级,非 llmanspec/ 下):v1↔v2 全命令对照矩阵(validate/change/init/archive/review/index/context/list/show/graph/spec/project)、真实项目试点步骤(../llman worktree 跑 v2 全流程)、性能基线记录。`release-v2-and-cutover` 的 proposal 引用该文件作为验收入口。性能脚本 `scripts/perf-baseline.ts` 输出耗时表(大 specs 目录 fixture)。

## 风险

- D2 移除 `'error'` quality 值会改动既有单测断言——随切片同步更新,无外部消费者(core 内部类型)。
- BDD 需新增 mock-fetch 注入步骤(既有 harness 只有真实 CLI/核心 API 步骤)——新增 `tests/bdd/steps/context.ts`,复用 `runContextRetrieval` 的 `fetchImpl` 注入口,不发明新 seam。
