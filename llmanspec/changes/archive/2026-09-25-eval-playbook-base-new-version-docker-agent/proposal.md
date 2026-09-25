---
depends_on: []
branch: sdd/eval-playbook-base-new-version-docker-agent
base_branch: main
base_sha: 0247c520a5b12b0648ab01a0c03f6bb0199a26ab
---

# 外部影响面 Eval 剧本流水线

## Why

`just qa` 只回答「本仓工具合约没改坏」。Skill 文案或门禁提示变了之后，外部用户 + 编码 agent 还守不守 SDD，没有可对打、不进 CI 的评测。本 change 用 **Harbor 当唯一调度**：Docker 隔离、Pi 无头 agent、Reward Kit 机械裁判、`harbor view` 人审轨迹；在模拟小费 CLI 上跑两轮 SDD（C1 建 change→归档，C2 再一轮归档），对打 **至少两个** 已命名 group（各挂一份 llman-sdd worktree：CLI + 渲染 skills）。相对指定 baseline group 出 delta。

探索材料（非 SSOT）：`docs/research/eval-harness-comparison.md`、`.local/eval-design.md`。套件写法对齐本机 Harbor skills：`create-task` / `rewardkit` / `harbor-exec`（exec 仅作可选后路，v1 不用）。

## What Changes

- 套件目录：`eval/tasks/playbook/`（Harbor multi-step 任务）、`eval/demo_projects/`（小费小 CLI 种子）、`eval/groups.yaml`（`groups` 映射 **≥1** 个名字自定的 group；第二组可选；空 `worktree` = 当前仓；`baseline` 指出 delta 零点）。结果只进 `.local/eval/`，按 run 结构化保留（见 design）。
- 唯一入口：`just eval` → 按 group **串行** `harbor run`（尽量全局 vLLM in-flight ≤ 2：`n_concurrent_trials: 2`，group 之间不并行）。不引入 promptfoo；人审用 `harbor view .local/eval/jobs`。
- 一条 trial = 同容器 `c1-tip-integer-archive` → `c2-zero-amount-archive`。第一轮 `min_reward = 1.0` 未达则中止，第二轮不跑。init 在 `steps/c1-tip-integer-archive/workdir/setup.sh`，不是 Pi 被评阶段。
- `n_attempts: 3`（YAML 必填，CLI 不给缺省）；`<3` 时结论标 `n<3 (insufficient)`。
- 真 Pi 是本 change 的完成条件，不是后续 change。Oracle 只校准断言集（无模型），不能代替 Pi 剧本。缺 Pi 或 vLLM 端点时 `just eval` MUST 硬失败。
- 镜像与被测物分离：eval 镜像只含 bun/git/Node/Pi。`--mounts-json` 只读挂 worktree→`/opt/llman-sdd` 与 seed→`/opt/seed`；`setup.sh` `cp` 到 `/app` 后读写。`--skill` 取该 group worktree 的渲染 `.agents/skills`。
- MUST NOT 改 `just qa` 语义；MUST NOT 把剧本基线写入 golden；Python/Harbor **不进** `packages/`。

从规划移除：S2–S6 探针（与现有 unit/BDD 的 CLI 合同重复）；promptfoo 入口与 `eval/provider.ts`。

## Capabilities

- 新增 `eval-playbook`。
- `justfile` 增加 eval 配方；不把 `harbor` 注册进本仓 CLI，除非后续单独 change。

## Impact

- 跑真剧本需要 Docker + Harbor CLI + 预装 Pi 的镜像 + vLLM OpenAI 兼容端点；缺则硬失败（禁止 skip 成绿）。
- 不增加 CI 时间。
- Reward Kit 的 `checks.py` 落在 `eval/tasks/**`，不进 oxlint/tsc/`bun test tests/`。

## 已锁决策

- **只 Harbor**：multi-step = C1/C2（同容器，文件延续，符合「第二轮开发」）；Reward Kit = 机械记分卡；`harbor view` = 看逐步 reward + 轨迹。
- **独立镜像 + 只读挂载 + 容器内拷贝**：eval 镜像不含 llman-sdd、不因 group/种子变化而 rebuild。`groups.*.worktree` 与 `eval/demo_projects/` 经 `--mounts-json` 只读挂入；`setup.sh` `cp` 到 `/app` 后再 git/init。agent 只读写拷贝。仅 `-e docker`。
- **groups ≥ 1、第二组可选**：空 `worktree` = 当前仓；`experiment` 不是必填。`baseline` 仅在 ≥2 组时做 delta。
- **n_attempts: 3**（写在 YAML）。
- **LLM 并发尽量 ≤ 2**：Harbor `n_concurrent_trials: 2`；group 串行；单 trial 内 Pi 仍可能连发请求，无法硬闸模型内部并行。
- **打标之后**：改 skill 模板或改 `checks.py`，再跑非 baseline group。不把 👍 喂进第二个评测 UI。
- **C1/C2 不换容器**：冷启动是 **trial 之间**，不是 C1 与 C2 之间。
- **真 Pi 必须在本 change 交付**：评的是 agent 跟 skill，不是 Oracle 脚本。Oracle 仅证明断言能分真假。缺端点禁止把 skip 写成绿。

## Open Questions

- vLLM `model` 字符串实现时再填。
- C3（compact specs）仍可选、本 change 不做。
- 挂载要求宿主机 Docker（Harbor 云沙箱不能绑本机路径）；可接受。

## C1/C2 老板原话（形态 B，已选）

C1：这是一个刚接入 llman-sdd 的命令行小费工具。请按项目 skill 走完整 SDD：为「标准输出必须是整数分、exit 0」建立 change、落地 specs、实现、验证并归档。例：`bun src/main.ts 1000 15` 打印 `150`。不要在默认分支直接改 specs。做完 archive，不要问我要不要继续。

C2：再开新 change：金额参数为 0 时 MUST 打印 `0` 且 exit 0。走完整轮归档。不要改写上一轮 archive。不要问我要不要继续。
