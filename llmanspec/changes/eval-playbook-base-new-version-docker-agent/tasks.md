# 工作清单

seam: ① `harbor run -p eval/tasks/playbook -a oracle`（无模型，校准断言）；② `just eval` 按 group 串行 `harbor run -a pi`（≥2 group）；③ `harbor view .local/eval/runs/<id>`。不把真 Pi 剧本挂进 `bun test tests/`。完成判据在 **本 change 分支**上相对 merge-base 测量。

- [ ] T1: 落地 `eval-playbook` capability（Harbor-only；groups 映射 ≥2、名字自定、`baseline` 键；multi-step C1/C2；init=setup.sh 从只读挂载 `cp`；结果进 `.local/eval/runs/<id>/`；qa 不调用 harbor）
  - 完成判据: `llman-sdd validate eval-playbook-base-new-version-docker-agent --strict` 结构过；新 `@executable` 不调用 Docker/Pi/Harbor
- [ ] T2: [blocked-by: T1] `eval/tasks/playbook/` multi-step 任务 + `eval/demo_projects/` 小费 CLI + Reward Kit 准则 + 每步 `solution/solve.sh`；`environment.network_mode` 非缺省 public
  - 完成判据: 任务目录可被 Harbor 识别（`instruction` 在 steps 下、`[[steps]]` 名与目录一致）；Oracle 路径未跑 qa
- [ ] T3: [blocked-by: T2] `eval/groups.yaml` + `just eval`：独立镜像、`--mounts-json` 只读挂 worktree+seed、setup.sh `cp` 到 `/app`、`--skill` 同源、`-e docker`、`-n 2`、`-k 3`、每 group 写入 `.local/eval/runs/<id>/groups/<name>`、写 `rollup.json`（相对 baseline 的 delta）
  - 完成判据: `just -n eval` 显示串行多次 `harbor run` 且含 `--mounts-json`；groups 少于 2 或路径缺失人读错误非零退出；justfile 相对 merge-base 仅增加 eval 配方
- [ ] T4: [blocked-by: T2] Oracle 正例 reward=1.0；负例（`validate <id> --no-check`）`validate_specs_strict=0`。不进 `just qa`
  - 完成判据: 实现者在绑定分支跑通 Oracle 正/负例（证据写在 PR/会话，不写入 golden）
- [ ] T5: [blocked-by: T1] TS 校验 `groups.yaml`：映射 ≥2、`baseline` 属于 keys、`n_attempts` 存在；禁止 `harbor run` 进 qa
  - 完成判据: 本分支 `bun test tests/unit/eval-groups-schema.test.ts` 退出 0，且 `just qa` 仍不启动 harbor/Pi
