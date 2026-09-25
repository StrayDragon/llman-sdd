# 剧本 eval 设计（Harbor-only）

参考本机 `/home/l8ng/Projects/__straydragon__/harbor/skills/{create-task,rewardkit}`。确定性断言优先；不自研第二套 UI。

## 分层

| 层 | 职责 | 不做什么 |
|---|---|---|
| `eval/groups.yaml` | `groups` 映射（≥2 名字自定）、`baseline`、`n_attempts: 3`、vLLM model | 不写 Docker 生命周期 |
| eval 镜像（一次构建） | bun + git + Node 24 + 预装 Pi；**零 llman-sdd 源码** | 不为每个 group 重建 |
| `eval/tasks/playbook/` | Harbor 任务：Dockerfile/预构建 tag、multi-step C1/C2、Reward Kit、Oracle | 不 COPY 某一版 CLI |
| `eval/demo_projects/` | C1 boot（小费小 CLI）拷进 `steps/c1/workdir/` | 不是给开发者日常开发的 app |
| `just eval` | 按 group **串行** `harbor run --mounts-json`；`-o .local/eval/runs/<id>/` | 不并行两个 group（尽量守 vLLM 顶 2） |
| `harbor view .local/eval/runs/<id>` | 人审：逐步 reward、轨迹、verifier 文件 | 不是 promptfoo 👍 库 |

缺 Docker / Harbor / Pi / vLLM 端点：非零退出，禁止 skip 成绿。

## 目录（场景即数据）

```
eval/
  groups.yaml
  demo_projects/tiny-cli/          # 源；setup 拷到 C1 workdir
  tasks/playbook/
    task.toml                      # schema_version 1.4, multi_step_reward_strategy
    environment/Dockerfile         # 独立基座；不含 llman-sdd
    # n_attempts: 3 写在 groups.yaml / job config，不在 CLI 缺省
    steps/c1/
      instruction.md               # 老板原话 C1
      workdir/                     # tiny-cli + setup.sh
      tests/                       # 本步 Reward Kit
      solution/solve.sh            # Oracle：脚本走完 SDD，无 Pi
    steps/c2/
      instruction.md               # 老板原话 C2
      tests/
      solution/solve.sh
    tests/                         # 共享 @criterion helpers，每步先上传再被 step tests 覆盖
```

增删断言改 `steps/*/tests/*.py`；增删阶段改 `[[steps]]`。不改 justfile。

## 一条 trial 时间线（预演）

```
新容器（冷）= 独立镜像 + 只读 bind（worktree→/opt/llman-sdd，seed→/opt/seed）
  Harbor 上传 job --skill（该 group worktree 的 .agents/skills）
  Pi setup：cp skills → $HOME/.agents/skills（失败静默 → 后面准则打红）
steps/c1:
  setup.sh（agent 用户、cwd=/app）：
    cp -a /opt/seed/. /app/
    git init + 首提
    /opt/llman-sdd 上的 CLI init --locale zh-Hans
    打开 bdd.run_command（会红的真实测试，禁止 exit 1 假命令）
    断言 .agents/skills/llman-sdd-explore/SKILL.md 存在
    unset LLMAN_SDD_HARNESS_ACTIVE
    rm -- "$0"
  Pi 跑 C1 instruction（--approve，信任项目 skill）
  Reward Kit @ /app：本步记分卡
  reward < min_reward(1.0) → 中止 trial，C2 不跑
steps/c2: 同容器，仓库已含 C1 产物
  Pi 跑 C2
  Reward Kit：第二轮归档 + 未改写 C1 archive
聚合：multi_step_reward_strategy = "final"
  （末步已含「两轮都在」；若 C1 早停，final = C1 结果，不是假绿 C2）
```

**同容器不是泄漏。** C2 要在 C1 的 git 历史上继续。隔离边界是 **(group × attempt)** 各一新容器。

## 版本对打（独立镜像 + 只读挂载 + 容器内拷贝）

**不**为每个 group 或每次改种子 rebuild 镜像。镜像是工具基座（bun/git/Node/Pi）。Harbor job 的 `environment.mounts`（CLI：`--mounts-json`）在 **本地 Docker** 把宿主机路径 bind 进来；`setup.sh` 再拷到容器内可写目录。云沙箱没有宿主机路径，本仓 eval **只支持 `-e docker`**。

separate verifier **不继承** runtime mounts。机械准则要调挂载的 `llman-sdd`，verifier 必须 shared。

挂载（全部 `read_only: true`，`bind.create_host_path: false`）：

| host | 容器 | 用途 |
|---|---|---|
| `groups.<id>.worktree` | `/opt/llman-sdd` | 被测 CLI + 该版本已渲染 skills |
| 本仓 `eval/demo_projects/tiny-cli` | `/opt/seed` | 初始化项目；改种子不 rebuild |

`just eval` 每个 group：

1. worktree / seed 路径不存在则硬失败。
2. `--mounts-json` 含上表两条。
3. `--skill <worktree>/.agents/skills`。
4. `--job-name playbook-<group>`，`-o .local/eval/runs/<run-id>/groups/<group>`。

`steps/c1/workdir/setup.sh`（Harbor 在 agent 前、WORKDIR=/app 执行）：

```bash
cp -a /opt/seed/. /app/
# 禁止 cp 整个 /opt/llman-sdd 进 /app（污染 demo、拖垮 node_modules）
git init && git add -A && git commit -m "seed"
/opt/llman-sdd/.../llman-sdd init --locale zh-Hans   # PATH 或 bun 入口
# 打开 bdd.run_command；unset LLMAN_SDD_HARNESS_ACTIVE
test -f .agents/skills/llman-sdd-explore/SKILL.md
rm -- "$0"
```

之后 Pi 只在 `/app` 读写。RO 挂载保证宿主机 llman-sdd 仓不会被 agent `git commit`。ro 下不能对 worktree `bun install`——预检在宿主机做。

准则：项目 skill 存在，且与 `/opt/llman-sdd/.agents/skills` 哈希一致。

## groups.yaml 与结果留存

名字自定，比较实验 **至少 2** 个 group；少于 2 硬失败。`baseline` 是 delta 零点的 group 名，缺省为映射第一项。`base`/`new_version` 只是示例名。

```yaml
n_attempts: 3
baseline: stable          # 必须是 groups 里的一个键
model: openai/<vllm-id>   # 实现时填
groups:
  stable:
    worktree: /path/to/wt-a
  experiment:
    worktree: /path/to/wt-b
```

一次 `just eval` 生成：

```
.local/eval/runs/<run-id>/
  config.snapshot.yaml      # 当时的 groups.yaml 拷贝（含 worktree 绝对路径）
  rollup.json               # 每 group 的 reward 均值/通过率 + 相对 baseline 的 delta
  SUMMARY.md                # 人读一屏：结论 / 风险≤3 / 待决策
  groups/<name>/            # 该 group 的 Harbor jobs_dir（轨迹、reward.json）
```

Harbor 原生 job 目录是明细 SSOT；`rollup.json` 是对打表。不入库、不进 golden。后一次 run 不覆盖前一次（`<run-id>` 用时间戳或 Harbor job-name）。`harbor view` 指向该 run 下的 `groups/` 或 run 根（若 viewer 吃多 job）。

LLM 并发尽量 ≤ 2：`n_concurrent_trials: 2`、`agents[].n_concurrent: 2`、`concurrency_group: vllm`、**group 串行**。单 Pi trial 内部仍可能连发 chat；无法在 Harbor 层硬闸，只保证同时进行的 trial ≤ 2。

## 记分卡（每步 Reward Kit 维度）

共享 verifier（默认）：检查要看 agent 工作树的 git。不要 separate verifier（那只看 artifacts）。

建议 `all-pass` 聚合；子键给人审一行一行翻：

| 键 | 机械代理 | 反假证据 |
|---|---|---|
| `skills_present` | 项目 `.agents/skills/llman-sdd-*/SKILL.md` 存在 | 排除适配器 `cp \|\| true` 空拷 |
| `harness_clear` | `LLMAN_SDD_HARNESS_ACTIVE` 空 | 嵌套守卫假跳过 |
| `not_default_branch_specs` | specs 提交不在默认分支 | 对照 `git log` / `show` 绑定 |
| `attached` | proposal frontmatter 有 CLI 写的 `branch` | 禁手写非法字段 |
| `validate_specs_strict` | **`validate --specs --strict` 退出 0** | 禁止只信 `validate <id>`（产品缝：change-id 目标不跑 harness） |
| `archive_once` | `git log --grep='archive(sdd):'` 恰好 1（C1）或 2（C2） | 禁双 finalize |
| `c1_archive_untouched` | C2 步：C1 archive commit hash 仍在 | 禁改写上一轮 |
| `demo_behavior` | `bun src/main.ts …` 期望 stdout | 产出质量，不是 CLI 单测 |

墙钟 / token：Harbor trial 自带；附录，不进 pass 门槛。

instruction.md **不泄漏** 上表。Oracle `solve.sh` 必须让全键 = 1，否则断言假红。

校准坏例：故意 `validate <id> --no-check` 的 solve 变体应 `validate_specs_strict=0`。该变体只作本地 Oracle 负例，不进 `just qa`。

## 命令预演（实现阶段才跑）

```bash
harbor run -p eval/tasks/playbook -a oracle \
  -o .local/eval/runs/<run-id>/groups/oracle --job-name oracle-playbook

harbor run -p eval/tasks/playbook -a pi -m "<vllm-model>" -e docker \
  -k 3 -n 2 \
  --skill <group-worktree>/.agents/skills \
  --mounts-json '[worktree→/opt/llman-sdd, seed→/opt/seed, 均 read_only]' \
  -o .local/eval/runs/<run-id>/groups/<name> --job-name playbook-<name>
# 下一 group 等上一 job 结束再跑

harbor view .local/eval/runs/<run-id>
```

`just eval` 只是上述顺序的别名 + 写 `config.snapshot.yaml` / `rollup.json`。人读一屏在 `SUMMARY.md`；主审仍在 viewer。

vLLM：OpenAI 兼容；temperature 钉 0；attempt 种子 = `base_seed + attempt_index`（在线 batch 不保证 bit 级可复现，报告须写明）。Pi 与准则共用同一端点时仍占并发预算——MVP 无 LLM judge，准则不占。

## 打标反馈环（不是叙事）

`harbor view` 逐步展开 Rewards 树 + 轨迹。人不同意某一行：

1. **裁判错**（假红/假绿）→ 改 `checks.py` 或 Oracle，再跑 `harbor run -a oracle`。
2. **agent 跟错 skill** → 改 `packages/core/templates`（正式 change），本 eval change 只消费渲染产物。
3. **难判 trial** → 目录留在 `.local/` 当回归夹具，不入库 golden。

没有 DPO 闭环。标签的唯一下游是 git 里的 skill 或 verifier。

## Agent 可插拔

默认 `-a pi`。换 Cursor CLI 是另一次 `harbor run -a cursor-cli`，任务目录不动。Pi 必须 `--approve`（或 Harbor `build_cli_flags`）否则不信任项目 `.agents/skills`。镜像预装 Pi，禁止 trial 时 nvm+npm（allowlist 会挂）。

网络：`[environment].network_mode` 对 vLLM 用 allowlist（宿主机/内网端点），禁止缺省 `public`。Docker 无 `dynamic_network_policy`：agent 与 verifier 网络基线必须相同，或接受 shared + 同一 allowlist。

## 与 qa 的边界

`just qa` / `bun test tests/` 不调用 `harbor run`、不 docker、不 Pi。新 capability 的 `@executable` 只覆盖：`groups.yaml` 映射 ≥2、`baseline` 必须是其中一键、`n_attempts` 存在性（若用 TS 读文件）。真 Oracle/Pi 只经 `just eval`。禁止 `makeTempRepo` 当剧本 boot。

## 测试接缝

1. **Harbor 任务形态**：`harbor run -a oracle` 退出 0 且 reward 1.0（人/实现阶段；非 qa）。
2. **负例 Oracle**：`--no-check` 假绿路径 `validate_specs_strict=0`。
3. **wrapper**：`groups` 少于 2 个、`baseline` 不是其中一键、或缺端点 → 硬失败。
