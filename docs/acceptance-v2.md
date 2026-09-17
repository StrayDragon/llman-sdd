# v2 验收清单

发布与切换(`release-v2-and-cutover`)的验收入口。切换完成后,行为合约的唯一 SSOT 是 `llmanspec/specs/*.feature`;本清单记录验收事实与执行记录。

## 1. 能力覆盖矩阵

| 命令域          | CLI 形态                                     | 验收方式                                                              | 状态 |
| --------------- | -------------------------------------------- | --------------------------------------------------------------------- | ---- |
| init 渲染       | `init [--update]`                            | golden:check(渲染 vs v2 自有快照基线,版本号归一化)+ BDD r19 场景      | ✅   |
| validate        | `validate --specs --no-check [--strict]`     | r11-r13 BDD(种子缺陷判定/退出码)+ 单测                                | ✅   |
| list/show/graph | `list [--specs] [--json]` / `show` / `graph` | r20-r21 BDD(真实工作区结构断言)+ 单测                                 | ✅   |
| spec 助手       | `spec skeleton` / `spec next-req-id`         | r22 BDD/单测                                                          | ✅   |
| review          | `review [--json] [--export-html]`            | r23 BDD(六信号/汇总/退出码)                                           | ✅   |
| archive 冷备    | `archive freeze/thaw`                        | r25 BDD(v2 冻结解冻自洽 roundtrip)+ integration                       | ✅   |
| change 生命周期 | `change new/start/attach/diff/finalize`      | r14-r16 BDD(start 门/squash 收口)+ integration                        | ✅   |
| index           | `index rebuild/check`                        | r26 BDD(新鲜度闭环)                                                   | ✅   |
| context 检索    | `context --task/--paths/--top`               | r27-r29 BDD(mock 驱动:去重/汇总/降级)+ `just smoke-context`(真实 LLM) | ✅   |
| project migrate | `project migrate`(引导壳)                    | r22 合约:legacy 迁移不随本工具提供                                    | ✅   |

## 2. 狗粮切换记录(2026-09-16)

- `bun apps/cli/src/main.ts init --update` 对本仓库执行:10 skills 重渲染,**零内容漂移**(仅 v2 渲染器按 r17 契约去除多余空行 + 版本号 0.1.0)
- 根 `AGENTS.md` 托管块字节级稳定;`llmanspec/AGENTS.md` 托管块恢复工具占位行(工具所有,块外用户内容保留)
- 切换后 v1 流水线(llman sdd list/validate)仍可用至本 change finalize

## 3. 临时 v1 行为对拍(历史记录;门已随切换拆除)

切换前以 `scripts/temp-parity-v1.ts` 跑过 25 项扩充对照矩阵,全部一致;对照中发现并修复了 3 处实现漂移(`change new` 参数互斥与输出格式、freeze 消息格式、context 退出码)。切换完成后该脚本与 golden:cli/golden:validate/BDD 活体场景已全部移除——`llmanspec/` 是行为的唯一 SSOT。

## 4. 性能基线(`bun scripts/perf-baseline.ts [caps] [runs]`)

2026-09-16 实测(bun 子进程耗时,含 ~70ms 运行时启动):

| 操作                        | 9 caps(×3 req ×2 场景) | 60 caps    |
| --------------------------- | ---------------------- | ---------- |
| validate --specs --no-check | mean 87ms              | mean 105ms |
| index rebuild               | mean 112ms             | mean 107ms |
| index check                 | mean 103ms             | mean 82ms  |
| list --specs --json         | mean 77ms              | mean 112ms |
| context(model-unset 守卫)   | mean 85ms              | mean 80ms  |

结论:9→60 caps 全操作均值 <130ms,规模近平坦(bun 启动主导);真实 LLM 检索延迟由端点决定(实测冒烟 23.6s/12 轮上限内 5 次工具调用)。

## 5. 已知裁决记录(不阻断验收)

- `Agent pid` 存活检测的噪声细节不移植(环境相关,非合约)。
- v2 `context` 成功时 `qualityNote: "pageindex"`(v1 为 `null`,语义等价)。
- 真实 LLM 分类存在非确定性:direct/related 档内条目可能轻微浮动(模型行为);跨档重复已由 r28 去重规则消除。
- v2 不携带 legacy 迁移实现(`project migrate` 为引导壳,r22)。
