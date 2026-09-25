# 工作清单

seam: ① `harbor run -p eval/tasks/playbook -a oracle`（无模型，校准断言）；② `just eval` 按 group 串行 `harbor run -a pi`（≥2 group）；③ `harbor view .local/eval/runs/<id>`。不把真 Pi 剧本挂进 `bun test tests/`。完成判据在 **本 change 分支**上相对 merge-base 测量。

- [x] T1: 落地 `eval-playbook` capability（Harbor-only；groups 映射 ≥2、名字自定、`baseline` 键；multi-step `c1-tip-integer-archive` / `c2-zero-amount-archive`；init=setup.sh 从只读挂载 `cp`；结果进 `.local/eval/runs/<id>/`；qa 不调用 harbor）
  - 完成判据: `llman-sdd validate eval-playbook-base-new-version-docker-agent --strict` 结构过；新 `@executable` 不调用 Docker/Pi/Harbor
- [x] T2: [blocked-by: T1] `eval/tasks/playbook/` multi-step（`c1-tip-integer-archive` / `c2-zero-amount-archive`）+ `eval/demo_projects/` 小费 CLI + 机械准则 + 每步 `solution/solve.sh`；`environment.network_mode` 非缺省 public
  - 完成判据: `[[steps]].name` 与 `steps/<name>/` 目录一致；Oracle 路径未跑 qa
- [x] T3: [blocked-by: T2] `eval/groups.yaml` + `just eval`：**默认 `-a pi`**、独立镜像、`--mounts-json` 只读挂 worktree+seed、setup.sh `cp` 到 `/app`、`--skill` 同源、`-e docker`、`-n 2`、`-k 3`、每 group 写入 `.local/eval/runs/<id>/groups/<name>`、写 `rollup.json`。缺 Pi/vLLM 硬失败，禁止 skip。
  - 完成判据: `just -n eval` 显示串行 `harbor run -a pi`；本 change 在绑定分支上至少成功拉起一次真 Pi trial（或端点缺失时非零退出且人读说明缺什么）——**不得**用 Oracle 成绩冒充剧本成绩
- [x] T4: [blocked-by: T2] Oracle 正例 reward=1.0；负例 `validate_specs_strict=0`。在 Pi 花钱之前跑，**不是** Pi 的替代交付物。不进 `just qa`
  - 完成判据: 实现者在绑定分支跑通 Oracle 正/负例（证据写在 PR/会话，不写入 golden）
- [x] T5: [blocked-by: T1] TS 校验 `groups.yaml`：映射 ≥2、`baseline` 属于 keys、`n_attempts` 存在；禁止 `harbor run` 进 qa
  - 完成判据: 本分支 `bun test tests/unit/eval-groups-schema.test.ts` 退出 0，且 `just qa` 仍不启动 harbor/Pi
