# 收口验收

## 判定

一次收口要不要跑验收，只看三件事，按这个顺序：

1. 带了 `--no-check`：不跑。标准错误里写 `bdd harness skipped: --no-check`。结构检查也仍按今天的方式跳过。
2. `needs_specs_change: false`：不跑，也不因为缺命令而失败。
3. 其余情况，扫描活规格。没有任何 `@executable` 场景：不跑。有，则必须真执行：
   - `bdd.run_command` 为空或未配置 → 退出码 1，文案含 `executable scenarios have no bdd.run_command`，零写入。
   - 环境变量 `LLMAN_SDD_HARNESS_ACTIVE=1` → 退出码 1，文案含 `nested invocation`，零写入。不把 INFO 当成通过。
   - 否则用与 `validate` 相同的 runner 在项目根执行该命令。退出码非 0 或无法启动 → 退出码 1，文案含 `bdd harness failed`，零写入。

`change finalize` 与 `change archive` 共用这个判定。`archive --force` 只跳过任务门和 git 门，不跳过验收。`review` 和 `show` 不进入这个判定。

## 为什么不缓存

转发和缓存留到验收「没跑」已经会失败之后。这一版每次该跑的收口都实跑。

## 测试接缝

沿用 `tests/bdd` 里临时仓库的 CLI 子进程（`makeTempRepo().run` 会剥掉嵌套守卫）。不新开测试入口。场景写在 `change-lifecycle.feature`，步骤落在 `tests/bdd/steps/lifecycle.ts`。

## 模板

`llman-sdd-apply` 与 `llman-sdd-verify`（zh-Hans 与 en）各加一句：收口会执行已配置的 `bdd.run_command`，收口前不必再跑；`--no-check` 打出的跳过说明不是通过。对账标记加在 `tests/unit/template-guidance-parity.test.ts`。随后 `init --update` 并刷新 golden。
