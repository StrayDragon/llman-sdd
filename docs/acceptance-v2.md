# v2 验收清单(v1↔v2 对等 / release 前验收入口)

`release-v2-and-cutover` 的验收入口。基线:v1 Rust llman 0.0.78。本文所有"实测"条目在 refine-slop-qa-release 收口时(2026-09-16)于本机执行记录。

## 1. 命令对照矩阵

| 命令域              | v1 形态                                        | v2 形态                                | 对照方式                                               | 状态                |
| ------------------- | ---------------------------------------------- | -------------------------------------- | ------------------------------------------------------ | ------------------- |
| init 渲染           | `llman sdd init [--update]`                    | `init [--update]`                      | golden:check(基线字节级,版本号归一化)                  | ✅ 实测通过         |
| validate            | `sdd validate --specs [--no-check] [--strict]` | `validate --specs --no-check`          | golden:validate(种子缺陷判定集)+ BDD                   | ✅ 实测通过         |
| list changes/specs  | `sdd list [--specs] [--json]`                  | `list [--specs] [--json]`              | golden:cli 活体对照                                    | ✅ 实测通过(4 变体) |
| graph               | `sdd graph --format mermaid`                   | `graph --format mermaid`               | golden:cli(排序集)                                     | ✅ 实测通过         |
| show change         | `sdd show <id> --output json --type change`    | `show <id> --output json`              | golden:cli(JSON 结构)                                  | ✅ 实测通过         |
| show spec           | `sdd show <cap> --type spec`                   | `show <cap> --type spec`               | golden:cli                                             | ✅ 实测通过         |
| spec next-req-id    | `sdd spec next-req-id`                         | `spec next-req-id`                     | golden:cli                                             | ✅ 实测通过         |
| review              | `sdd review [--json]`                          | `review [--json] [--export-html]`      | golden:cli(六信号/汇总/退出码)                         | ✅ 实测通过         |
| index rebuild/check | `sdd index …`                                  | `index …`                              | golden:cli(输出形状)+ BDD 新鲜度闭环                   | ✅ 实测通过         |
| change 生命周期     | `sdd change new/start/attach/diff/finalize`    | `change …`(同子命令)                   | BDD(start 全链路/squash 收口)+ integration             | ✅ 实测通过         |
| archive 冷备        | `sdd archive freeze/thaw`                      | `archive freeze/thaw`                  | BDD(v1 冻结 → v2 解冻字节一致)+ integration            | ✅ 实测通过         |
| context 检索        | `sdd context --task/--paths`                   | `context --task/--paths/--top`         | r27-r29 BDD(mock 驱动)+ `just smoke-context`(真实 LLM) | ✅ 实测通过         |
| project migrate     | `sdd project migrate`(legacy 实现)             | `project migrate`(入口 stub,提示用 v1) | 范围裁决:不在 v2 实现迁移                              | ✅ 按设计           |

## 2. 真实项目试点(../llman,27 specs)

步骤(worktree 隔离,只读命令 + index 写入临时 worktree,结束后清理):

```bash
git -C ../llman worktree add /tmp/llman-sdd-pilot --detach
cd /tmp/llman-sdd-pilot
bun <repo>/apps/cli/src/main.ts validate --specs --no-check   # 期望全 OK
bun <repo>/apps/cli/src/main.ts list / list --specs --json
bun <repo>/apps/cli/src/main.ts show <spec-id> --type spec
bun <repo>/apps/cli/src/main.ts graph --format mermaid
bun <repo>/apps/cli/src/main.ts index rebuild && index check  # 期望 fresh
cd ../llman && git worktree remove --force /tmp/llman-sdd-pilot && git worktree prune
```

实测记录(2026-09-16):

- `validate --specs --no-check` → **Totals: 27 passed, 0 failed**;同仓 v1 对照 → **Totals: 27 passed, 0 failed**(判定一致)
- `list`/`list --specs --json`(27 specs)/`show claude-code-account-management --type spec`/`graph` 全部正常
- `index rebuild`(27 specs)→ `index check` **fresh**
- `context --task`(model 未设守卫)→ `quality: unavailable` + `summary {totalSpecs:0, error:true}`(r29 错误契约活体实证)
- 真实 LLM 链路(`just smoke-context`,本仓 9 specs):**PASS**,quality=agentic,direct=[validation, spec-parsing],toolCalls=5,去重不变量成立

## 3. 性能基线(`bun scripts/perf-baseline.ts [caps] [runs]`)

2026-09-16 实测(bun 子进程耗时,含 ~70ms 运行时启动):

| 操作                        | 9 caps(×3 req ×2 场景) | 60 caps    |
| --------------------------- | ---------------------- | ---------- |
| validate --specs --no-check | mean 87ms              | mean 105ms |
| index rebuild               | mean 112ms             | mean 107ms |
| index check                 | mean 103ms             | mean 82ms  |
| list --specs --json         | mean 77ms              | mean 112ms |
| context(model-unset 守卫)   | mean 85ms              | mean 80ms  |

结论:9→60 caps 全操作均值 <130ms,规模近平坦(bun 启动主导);真实 LLM 检索延迟由端点决定(实测冒烟 23.6s/12 轮上限内 5 次工具调用)。

## 4. 已知差异(裁决记录,不阻断验收)

- `Agent pid` 存活检测的噪声细节不移植(环境相关,非合约;design D5)。
- v2 `context` 成功时 `qualityNote: "pageindex"`,v1 为 `null`(语义等价)。
- 真实 LLM 分类存在非确定性:direct/related 档内条目可能轻微浮动(模型行为,非实现差异);跨档重复已由 r28 去重规则消除。
- v2 不携带 legacy 迁移实现(`project migrate` 为入口 stub,指引 v1)。
