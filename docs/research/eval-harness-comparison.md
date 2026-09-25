# 编码 Agent Eval Harness 对比（llman-sdd 外部影响面）

> 性质：explore 阶段决策材料，**不是**行为合约 SSOT。拍板后约束进 change/`llmanspec/`；本稿可随选型过期。
> 日期：2026-09-25。一手来源见文末。
> 仓库纪律：`just qa` 语义不动；eval 不进 CI / golden；结果落 `.local/`（gitignore）。

---

## 1. 我们实际要买什么

不是「通用 LLM 打分平台」，而是一条 **按需、耗时、Docker 隔离** 的流水线：

```
给定被测指令集（渲染后的 .agents/skills）
  + 一个最小 git 仓（llman-sdd CLI 可用）
  + 一段任务 prompt
→ 无头编码 agent 在容器里改文件/跑命令
→ 用 git 历史、frontmatter、validate --strict 退出码做机械验收
→ 人读三行摘要 + 同载荷 TOON；明细进 .local/
```

`just qa` 继续只回答「工具合约没改坏」。Eval 回答「skill/门禁改了之后，agent 还守不守纪律」。

### 1.1 用来给框架打分的尺子

| 尺子 | 对本仓的含义 |
|---|---|
| **隔离** | agent 不得碰宿主机工作树 / Docker daemon / 任意外网（LLM API 需白名单） |
| **场景即数据** | 加一条「默认分支改 specs 诱惑」= 加目录/文件，不改调度器 |
| **断言优先** | git log、proposal 合法键、无 `changes/<id>/specs/`、`validate --strict` 非 `--no-check` |
| **agent 接缝** | 最好有 Cursor / Claude Code / Codex；否则自定义适配成本 |
| **栈边界** | 产品运行时仍是 Bun+TS；Python 只允许作为 **eval CLI**，不进 `packages/core` |
| **集成活动** | 把本仓 CLI + bun + skills 塞进镜像、注入 prompt、捞日志 |
| **验证活动** | 写/跑机械断言、看一屏报告、对拍某 git ref、加场景零流程代码 |
| **按需** | 不进 `bun test tests/`（否则误入 `just qa`） |

---

## 2. 候选总表

| 候选 | 语言 | 许可 | 安装 | 一句话 |
|---|---|---|---|---|
| **Harbor** | Python ≥3.12 | Apache-2.0 | `uv tool install harbor` | Terminal-Bench 官方 harness：每任务一容器 + 脚本验仓 |
| **Inspect AI** | Python ≥3.10 | MIT | `pip install inspect-ai` | 英国 AISI 通用 eval 平台；Docker sandbox + 外部编码 agent |
| **inspect-harbor** | Python | MIT | `pip install inspect-harbor` | 用 Inspect 跑 Harbor **任务**（桥，不是第三种任务格式） |
| **promptfoo** | TypeScript | MIT | `npx promptfoo` | YAML 断言 + 模型/agent SDK 评测；Docker 主要跑**模型**不是工作树 |
| **Evalite** | TypeScript / Vitest | OSS（local-only） | npm | `.eval.ts` 像测试；无沙箱 |
| **自研薄封装** | Bun/TS | 本仓 | `scripts/eval.ts` | 抄 Harbor 目录约定 + `docker run` |
| Docker Sandboxes (`sbx`) | — | Docker 产品 | `sbx` | 交互式 microVM，不是 batch 任务模型 |

已排除：Braintrust / LangSmith（云实验、外发，与「结果只落 `.local/`」冲突）；lm-eval-harness / RAGAS（模型/RAG，不是编码 agent 改 git）。

---

## 3. 分框架

### 3.1 Harbor

**主要场景：** 评测「会改仓库的编码 agent」（Claude Code、Codex、Aider、OpenHands、**Cursor CLI**…）；官方跑 Terminal-Bench 2.0。

**任务形状（与我们的 fixture 同构）：**

```
eval/tasks/<id>/
  instruction.md           # prompt
  task.toml                # 超时、network_mode、CPU/内存
  environment/Dockerfile   # 或 docker_image / compose
  tests/test.sh            # 必须写出 /logs/verifier/reward.txt|json
  solution/solve.sh        # 可选：Oracle agent 用来证明断言集本身能被「完美解」打绿
```

Verifier 默认与 agent **同容器**（看得见工作树）；可 `environment_mode = separate` 让评分镜像看不到 `tests/`（防 agent 读题）。网络：`public` / `no-network` / `allowlist`；agent 阶段与 verifier 阶段可不同。

内置 agent 含 `cursor-cli`、`claude-code`、`codex`、`opencode` 等（源：Harbor `AgentName` 枚举）。自定义：继承 `BaseAgent`，`environment.exec` 进容器。Oracle / nop：分别用于「任务可解」校准与空跑对照。

**优**

- 沙箱是一等公民，不是插件。
- 场景 = 目录；加场景不改 Python。
- `test.sh` 可直接调 `llman-sdd validate --strict`、`git log`、`test -d`——断言优先无需 LLM judge。
- `reward.json` 可带多指标（墙钟、分项），人读摘要可后处理。
- 已有 `cursor-cli`，狗粮路径短。
- Oracle + `solve.sh` = 校准轮（证明 test.sh 能分辨好坏），不必另造 mock 产品面。
- 云厂商（Daytona/Modal）以后要并行再开，本地 Docker 已够。

**劣**

- Python 工具链（`uv`）；本仓 AGENTS.md 冻结的是 **产品运行时** Bun，eval CLI 旁路需写进约定，避免有人往 `packages/` 塞 Python。
- 年轻项目（公开仓约 2025-08），API/`task.toml` schema 仍在迭代（文档示例 `schema_version = 1.4`）。
- 报告 IR 不是 TOON；要一层转换才符合本仓「人读摘要 + TOON 同载荷」。
- 默认 `network_mode` 是 `public`——我们必须在任务里改成 allowlist（LLM API 主机），否则隔离承诺落空。
- reward 主路径是 0/1（或若干 float），「五维大脑」不是它的产品；对我们已简化的「每场景 pass/fail」反而合适。

**本项目契合度：高。** 集成工作量主要在 Dockerfile（bun + git + 本仓 CLI + skills 拷贝）和 6 条 `test.sh`，不在重写调度器。

**集成深度**

| 步骤 | 工作 | 深度 |
|---|---|---|
| 镜像 | `environment/Dockerfile`：Node/Bun、git、复制 `apps/cli` 或预装 `@llman-sdd/cli`、拷 `.agents/skills` | 本仓必写 |
| agent | `--agent cursor-cli`（或 claude-code）；skills 用 `--ae` / 镜像内文件 | 多为配置 |
| 网络 | `task.toml` `[agent] network_mode=allowlist` + 模型 API 主机 | 必配，否则不安全 |
| 入口 | `just eval` → `uvx harbor run -p eval/tasks …`；未装 docker/uv 则人读错误退出 | 薄封装 |
| CI | **不接**。与 `smoke-context` 一样：本地/专用机按需 | 零 |

**验证深度**

| 能力 | 落点 |
|---|---|
| 绑定分支 / archive 提交 / 无 delta specs 目录 | `test.sh` + `git`/`test` |
| `validate --strict` 真 harness | 镜像内 CLI；注意剥 `LLMAN_SDD_HARNESS_ACTIVE`（本仓已有先例） |
| `--no-check` 抗欺骗 | test.sh 扫 agent 日志 / git 是否出现 `--no-check`；或检查 stderr 无 skip 当 pass |
| 任务可解性 | Oracle + `solve.sh` 必须 reward=1，否则断言集假红 |
| 人读/TOON | Harbor 日志目录 → 小脚本转本仓报告 IR（`renderMachine`） |
| 对拍 ref | 两次 `harbor run`，镜像 `COPY` 不同 commit 的 skills；delta 自己算 |

---

### 3.2 Inspect AI（+ inspect-swe）

**主要场景：** 前沿模型能力/行为评测；ReAct+工具；CTF；用 `inspect-swe` 把 Claude Code / Codex / Gemini CLI 当 solver，跑在 sandbox 里。

**任务形状：** Python `@task`：dataset + solver + scorer + `sandbox="docker"`。Dockerfile/compose 可放任务旁。Scorer 是 Python 函数，可 `sandbox().exec` 进容器查文件。模型 API 在 **宿主机 Inspect 进程**，容器只跑工具/agent（[sandboxing 文档](https://inspect.aisi.org.uk/sandboxing.html) 写明：默认 compose `network_mode: none` 只管容器内进程，**评测进程与 provider 仍可上网**）。

**优**

- 沙箱实现成熟（Docker 内置；K8s/Proxmox/Daytona 插件），隔离协议有 AISI 文档。
- 自定义 scorer 比 bash 更强（可解析 TOON、结构化）。
- `inspect view` 看 transcript，调试 agent 轨迹比纯日志舒服。
- 200+ 现成 eval；若以后做「模型」而非「本仓 skill」评测，同一套工具能长。
- MIT；Python ≥3.10 比 Harbor 的 3.12 松。

**劣**

- 场景不是纯数据：加场景要改 Python 或 JSON dataset + 注册 task。
- 心智是「模型评测平台」，编码 agent 是扩展（inspect-swe），不是主叙事。
- **无内置 cursor-cli**（inspect-swe：claude_code / codex_cli / gemini_cli / opencode / mini_swe_agent / kimi_code）。Cursor 要自己桥。
- 概念面（solver/scorer/epochs/eval-set/log）明显重于「一条流水线」。
- 同样要把结果转成 TOON 人读摘要。

**本项目契合度：中高（若接受 Python 任务与更重工作流）；做「只评本仓 6 场景」偏重。**

**集成 / 验证：** 镜像仍要自己做；断言写成 scorer 而非 test.sh（类型更安全，但本仓贡献者要会 Python Inspect API）。validate 子进程同样要注意嵌套守卫。对人读一屏没有现成「结论/风险/待决策」模板。

---

### 3.3 inspect-harbor（桥）

把 Harbor **任务目录** 交给 Inspect 跑（`pip install inspect-harbor`，依赖 `harbor` + `inspect-ai`）。

**优：** 任务仍声明式；需要 Inspect View / 统一模型路由时再接，不必重写 6 个 scene。  
**劣：** 两条 Python 依赖链；排障时要分清是 Harbor 容器问题还是 Inspect 调度问题。  
**建议：** 不要作为 v1 必选。若先选 Harbor，此桥是「以后要好看 UI」的后门，不是现在的决策对象。

---

### 3.4 promptfoo

**主要场景：** prompt/模型回归、RAG、MCP、OpenAI Agents SDK 轨迹断言（`trajectory:tool-used` 等）。Docker 文档主线是 **Docker Model Runner 跑本地模型**，以及把 promptfoo 自己装进镜像，**不是**给每个样本挂一个可写 git 工作树。

断言类型丰富：`contains`、`javascript`、`python`、`llm-rubric`。`javascript` 可以读 output 字符串，但 **默认看不见容器内 git 状态**——除非自定义 provider 先在 Docker 里跑完 agent，再把「仓库快照 + 最终文本」塞进 output。那等于自研编排 + promptfoo 只当断言引擎。

**优：** TS、YAML、与本仓语言一致；断言库可抄进 test.sh。  
**劣：** 不解决宿主机隔离；轨迹断言绑特定 SDK，不是「任意编码 CLI」。若整次 eval 套一层 Docker，粒度是「一整次运行」不是「每场景一仓」，场景间会交叉污染。  
**契合度：低（主 harness）/ 中（只借断言清单）。**

---

### 3.5 Evalite

**主要场景：** 本地 TS 应用的 LLM 输出打 0–100 分；Vitest DX；localhost UI。

**优：** 纯 TS、无云。  
**劣：** 无 Docker 工作树隔离；基于 Vitest——若文件放错会被人拷进 `tests/` 从而进 `just qa`；分数文化与本仓「机械 pass/fail」相反。  
**契合度：低。**

---

### 3.6 自研：Harbor 目录 + `scripts/eval.ts` `docker run`

**主要场景：** 坚持 eval 编排也用 Bun，零 Python。

最小闭环：

1. 读 `eval/tasks/<id>/`（与 Harbor 相同，便于以后投奔）。
2. `docker build` / `docker run --network …`（allowlist）。
3. 容器内起 agent CLI（自己 exec）。
4. 跑 `tests/test.sh`，读 reward 文件。
5. 回收容器；写 `.local/eval/`。

**优：** 栈单一；超时/日志/TOON 可按本仓 IR 一次做对；`makeTempRepo` 思路可在镜像 ENTRYPOINT 复用。  
**劣：** 重写 Harbor 已提供的：并发、失败重试、日志下载、network 三模式、separate verifier、Oracle 校准、cursor-cli 安装。估时：可用 MVP 数日，行为与 Harbor 对齐则数周。自定义 agent 适配每个 CLI 的 headless 旗标都是坑。  
**契合度：中（控栈）/ 长期维护成本高。**

---

### 3.7 Docker Sandboxes（`sbx`）

给**人**在隔离 VM 里用 agent 改当前仓库。默认可写挂载工作区（`--clone` 才只读源仓）。无 instruction/verifier 任务模型，无 batch reward。  
**契合度：不当 eval harness**；与「保护宿主机」的日常开发是另一条线。

---

## 4. 对照矩阵（1–5，越高越好）

| 尺子 | Harbor | Inspect | promptfoo | Evalite | 自研薄封装 |
|---|---:|---:|---:|---:|---:|
| 每场景 Docker 工作树 | 5 | 5 | 2 | 1 | 5（自己做） |
| 网络隔离可配 | 5 | 4 | 2 | 1 | 4 |
| 场景当数据（零调度代码） | 5 | 3 | 4 | 3 | 5（若抄 Harbor 目录） |
| 机械验 git/CLI | 5 | 5 | 2 | 2 | 5 |
| 现成 Cursor/编码 CLI | 5（含 cursor-cli） | 3（无 Cursor） | 2 | 1 | 2 |
| 与 Bun 仓零摩擦 | 3 | 3 | 5 | 4 | 5 |
| 人读/TOON 开箱 | 2 | 2 | 2 | 3 | 4 |
| 不误入 just qa | 5 | 5 | 4 | 2 | 5 |
| 维护负担（越低分越高负担）* | 4 | 3 | 3 | 4 | 2 |
| **加权印象（本仓）** | **最贴** | 能做但重 | 错隔离模型 | 错模型 | 控栈、养生命周期 |

\*「维护负担」行：5 = 框架替你养沙箱；2 = 你自己养。

---

## 5. 「用户主要活动」深度：集成 vs 验证

把「用这条流水线的人」拆成两段活动（不是框架营销功能列表）。

### 5.1 集成（第一次能跑通）

| 活动 | Harbor | Inspect | 自研 |
|---|---|---|---|
| 装依赖 | uv + Docker Engine ≥24 | pip/uv + Docker | 仅 Docker + 本仓 bun |
| 把 llman-sdd 放进仓 | Dockerfile `COPY`/安装包 | 同左 | 同左 |
| 注入 skills | 镜像 COPY 或 `-v` 只读 | 同左 | 同左 |
| 接无头 agent | 现成 `cursor-cli` / `claude-code` | inspect-swe 短名单；Cursor 自写 | 每个 CLI 自写 argv |
| 模型密钥 | `--ae` 进容器；allowlist 主机 | Inspect 进程持钥，sandbox 代理 | 自己决定是否把钥打进容器 |
| 证明「不是套娃 validate」 | test.sh 里 unset `LLMAN_SDD_HARNESS_ACTIVE` | scorer 里同样 | 同样 |
| 第一次失败的调试面 | `/logs/agent` + `/logs/verifier` 拉回宿主机 | `inspect view` 更强 | 自己拼 docker logs |

Harbor / Inspect 在「集成」上的差：Harbor 少写 agent 适配；Inspect 少写（若不用 Cursor）但多写 task Python。自研在集成上最痛的是 agent CLI 矩阵。

### 5.2 验证（日常加场景、看结果、信结果）

| 活动 | Harbor | Inspect | 自研 |
|---|---|---|---|
| 加场景 | 新目录 + instruction + test.sh | 新 sample 或新 `@task` | 同 Harbor 目录则同 Harbor |
| 断言 git/validate | bash，本仓贡献者都熟 | Python scorer，更稳也更隔 | bash |
| 断言集校准 | Oracle + solve.sh 是一等公民 | 可写「标准解 solver」，非默认叙事 | 要自己做 oracle 模式 |
| 负面场景（quick 不得建 change） | test.sh `! test -d changes/foo` | scorer 同样 | 同样 |
| 一屏人读 | 需薄转换层 | 需薄转换层 | 可内建 |
| compare 某 git ref | 两次 run 不同镜像 tag | 两次 eval | 两次 run |
| 信任失败（反假证据） | 先看 test.sh 是否 Oracle 能过；禁止把 Docker 失败说成「agent 固有噪声」 | 同纪律 | 同纪律 |

**验证完备度结论：** 三种都能把本仓 6 条种子做成机械断言。差别不在「能不能验」，在 **校准（Oracle）和 agent 接缝谁已经写好**。Harbor 两边都有现成钩子。

---

## 6. 无论选谁，本仓都得自己写的部分

框架替不了这些（避免「选了 Harbor 就零工作」的幻觉）：

1. **eval 镜像**：bun 版本钉死、git identity、`llman-sdd` 入口、最小 `llmanspec/` seed（可借鉴 `makeTempRepo`，但跑在容器里而不是宿主机 `TMPDIR`）。
2. **六场景的 instruction + 断言脚本**（S1–S6 见 `.local/eval-design.md`）。
3. **报告**：结论一行 / 风险≤3 / 待决策 + TOON IR（`packages/core/src/render/machine.ts` 的 `encode`）。
4. **网络策略**：只放行模型 API；verifier 阶段可 `no-network`。
5. **纪律**：不进 `just qa`；结果 `.local/`；失败先查镜像/断言/嵌套守卫。
6. **被测物**：渲染后的 skills，不是 `packages/core/templates` 源文件。

---

## 7. 建议（供拍板，不是合约）

1. **v1 主路径：Harbor 当 runner + 容器内 agent 用 Pi**（TS，原生 `.agents/skills`）。Python 不进 `packages/`。
2. **不要**默认 Cursor CLI（技能路径、密钥、双重沙箱都更拧）。需要时再开对照。
3. **不要**用 promptfoo/Evalite 当主 harness。
4. Inspect / inspect-harbor 仍是后路，不是 v1。
5. 拒绝 uv 时：`scripts/eval.ts` `docker run` + 同款任务目录 + 镜像内 `pi`。

---

## 8. 来源

| 论断 | 来源 |
|---|---|
| Harbor 任务目录、reward.txt/json、Oracle、separate verifier、network_mode | [Harbor Task Structure](https://www.harborframework.com/docs/tasks) |
| Harbor 安装、Apache-2.0、Python ≥3.12 | [PyPI harbor](https://pypi.org/project/harbor/)、[GitHub LICENSE](https://github.com/harbor-framework/harbor/blob/main/LICENSE) |
| Harbor agent 枚举含 `cursor-cli` | [harbor `AgentName`](https://github.com/harbor-framework/harbor/blob/main/src/harbor/models/agent/name.py) |
| Inspect 能力、Docker sandbox、外部编码 agent | [inspect.aisi.org.uk](https://inspect.aisi.org.uk/)、[Sandboxing](https://inspect.aisi.org.uk/sandboxing.html)、[inspect-swe](https://meridianlabs-ai.github.io/inspect_swe/) |
| Inspect MIT、Python ≥3.10 | [inspect_ai LICENSE](https://github.com/UKGovernmentBEIS/inspect_ai/blob/main/LICENSE)、pyproject `requires-python` |
| inspect-harbor 桥 | [PyPI inspect-harbor](https://pypi.org/project/inspect-harbor/) |
| promptfoo 断言与 Docker Model Runner | [Assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/)、[Docker provider](https://www.promptfoo.dev/docs/providers/docker/) |
| Evalite 定位 | [evalite.dev](https://www.evalite.dev/what-is-evalite) |
| 本仓 qa / 临时仓 / 嵌套守卫 | `justfile`、`package.json` `"test": "bun test tests/"`、`tests/bdd/steps/shared.ts`、`llmanspec/AGENTS.md` |
| 设计前提（单流水线、不进 CI） | `.local/eval-design.md` |
| Harbor `cursor_cli.py` install/run/skills | [cursor_cli.py (main)](https://github.com/harbor-framework/harbor/blob/main/src/harbor/agents/installed/cursor_cli.py) |
| Harbor 限制出站须预装 agent | [harbor#2045](https://github.com/harbor-framework/harbor/issues/2045) |
| Cursor headless 旗标 | [Headless CLI](https://cursor.com/docs/cli/headless.md)、[Parameters](https://cursor.com/docs/cli/reference/parameters) |
| Cursor 企业网络域名 | [Network configuration](https://cursor.com/docs/enterprise/network-configuration) |
| METR Vivaria → Inspect | [vivaria.metr.org](https://vivaria.metr.org/) |
| HAL / AppWorld / tau-bench | [princeton-pli/hal-harness](https://github.com/princeton-pli/hal-harness) |
| OpenHands SWE-bench 评测 | [OpenHands/benchmarks](https://github.com/OpenHands/benchmarks) |
| TheAgentCompany | [evaluation README](https://github.com/TheAgentCompany/TheAgentCompany/blob/main/evaluation/README.md) |
| LangChain agentevals | [langchain-ai/agentevals](https://github.com/langchain-ai/agentevals) |
| Pi CLI / skills / npm | [pi.dev CLI](https://pi.dev/docs/latest/cli)、[Skills](https://pi.dev/docs/latest/skills)、[@earendil-works/pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) |
| Harbor 内置 Pi 适配器 | [pi.py](https://github.com/harbor-framework/harbor/blob/main/src/harbor/agents/installed/pi.py) |

---

## 9. 加深：Harbor `cursor-cli`（skills / 无头旗标 / 密钥网络）

源码：`src/harbor/agents/installed/cursor_cli.py`（2026-09 的 main）。声明 `AgentCapabilities(atif=True, skills=True, mcp_servers=True)`。

### 9.1 安装

`install()` 在 **每次 trial** 里对 agent 用户执行：

```text
curl https://cursor.com/install -fsS | bash && cursor-agent --version
```

这与「allowlist / no-network」冲突：trial 时要能访问 `cursor.com`（及安装脚本拉二进制的 CDN）。Harbor 自己的 [issue #2045](https://github.com/harbor-framework/harbor/issues/2045) 结论：**限制出站时必须把 agent CLI 烤进镜像**，trial 只 `command -v cursor-agent`。

对本仓的硬含义：eval Dockerfile 应 `RUN curl … | bash`（或 `COPY --from=` 预构建层），**不要**依赖 Harbor 默认的运行时安装。

### 9.2 无头命令（Harbor 实际发出的）

```text
cursor-agent --yolo --print --output-format=stream-json [build_cli_flags] --model=<slug> -- <instruction>
```

stdout JSONL tee 到 `/logs/agent/cursor-cli.txt`，再解析成 ATIF `trajectory.json`（含 token / 可选 USD）。

对照 Cursor 官方 headless 文档：

| 旗标 | 官方 | Harbor 是否带 | 对本仓风险 |
|---|---|---|---|
| `--print` / `-p` | 非交互 | ✅ | 必需 |
| `--yolo`（=`--force`） | 无确认改文件 | ✅ | 必需，否则只提案不落盘 |
| `--output-format=stream-json` | 轨迹 | ✅ | 给我们 cost 维 |
| `--model` | 模型 | ✅ `provider/model`，可拼 `[effort=high]` | Harbor 要求 `model_name` 含 `/` |
| `--trust` | 无提示信任工作区 | ❌ 未传 | Docker 里若弹出 trust，会挂死；应用 `build_cli_flags` 补上 |
| `--sandbox disabled` | 关掉 CLI 内嵌沙箱 | ❌ 未传 | **双重沙箱**：Docker 已隔离，Cursor 默认 sandbox 可能拦 `git`/`llman-sdd`/出站。应 disable |
| `--workspace` | 显式工作区 | ❌ | 依赖 cwd；Harbor 任务 workdir 一般够 |
| `--api-key` | 密钥 | ❌ 走环境变量 | 见下 |

社区有 `--print` 不退出的报告（需 timeout）。Harbor 的 `[agent] timeout_sec` 必须设（S1 建议 ≥600s）。

### 9.3 Skills 注入（路径不一致，必须处理）

Harbor 在 `install()` 末尾：

```text
mkdir -p ~/.cursor/skills && cp -r $skills_dir/* ~/.cursor/skills/
```

这是 **用户级** `~/.cursor/skills/`，不是本仓狗粮读的 **项目级** `.agents/skills/<stem>/SKILL.md`。

llman-sdd `init --update` 的产物面是 `.agents/skills/`（init-generators r19）。IDE/Agent 在本仓就是读这条路径。

因此 v1 应 **双写**：

1. 任务 workdir 里放完整 `.agents/skills/`（被测物 SSOT，与狗粮一致）。
2. 仍把同一套目录交给 Harbor `--skill`/`skills_dir`，让适配器拷到 `~/.cursor/skills`（Cursor CLI 若只扫用户目录也不漏）。

不要把 `packages/core/templates` 源文件直接当 skills_dir——必须先按 locale 渲染。

Harbor `cp … 2>/dev/null || true` **拷失败静默**。校准轮必须断言容器内 `.agents/skills/llman-sdd-explore/SKILL.md` 存在，否则「agent 不守纪律」可能只是 skill 没装上。

### 9.4 密钥

`CURSOR_API_KEY` **必须**在 Harbor 宿主机进程环境里（适配器 `os.environ`），再 `exec_as_agent(..., env=)` 打进容器。没有则 `ValueError`，trial 直接失败。

- 用 User API Key（Integrations），Admin key 对 CLI 无效（Cursor 论坛/文档口径）。
- **禁止**写进 Dockerfile / git。`harbor run --ae CURSOR_API_KEY` 或外壳 export。
- 连通性失败常被 CLI 报成 “invalid API key”（论坛已知）。allowlist 漏主机时会假扮成鉴权错误——先 `curl -v https://api2.cursor.sh` 再怪 key。

### 9.5 网络 allowlist（agent 阶段）

企业文档（[Network configuration](https://cursor.com/docs/enterprise/network-configuration)）建议模式 `*.cursor.sh` 等。Harbor `allowed_hosts` 支持 leading wildcard。

**Agent 阶段最低集（安装已烤进镜像、关闭 web search 时）：**

- `*.cursor.sh`（含 `api2` 通用 API、`api5` / `agent*.api5.cursor.sh` agent）
- 若 CLI 还打 `api.cursor.com`：一并加入
- **不要**放行 `cursor.com/install`（已预装）
- **不要**放行任意 npm/pypi，除非场景显式要装包

**Verifier 阶段：** `network_mode = no-network`（只跑 git / `llman-sdd validate`）。本仓 `bdd.run_command` 若在镜像内是 `bun test`，不需要外网。

**Install 未预装时**还要：`cursor.com`、`*.cursor-cdn.com`、可能 S3——这正是不要运行时安装的原因。

Harbor 默认 `[environment].network_mode = public`。任务 toml **必须改掉**，否则「Docker 保护宿主机」只防了文件系统，不防任意 egress（密钥、扫内网）。

---

## 10. 加深：eval 镜像（bun 钉版 / CLI / 嵌套守卫 / allowlist）

目标：容器 = 一个「刚 `init` 过的用户仓」+ 预装工具；agent 以为自己在普通项目里。

### 10.1 钉版本

| 钉 | 本仓文件 | 镜像 |
|---|---|---|
| Bun | `.bun-version` → **1.4.0** | `COPY .bun-version` + 官方安装脚本按该文件 |
| Node | `.node-version` → **24.15.0** | 可选；运行时代码禁用 Bun 专属 API，但 CLI 入口是 `bun apps/cli/src/main.ts`。镜像主路径用 bun 即可 |
| llman-sdd | git tag / `package.json` version | 复制本仓源码 `bun install --frozen-lockfile`，或安装发布的 `@llman-sdd/cli`。**评测 HEAD skills 时必须 COPY 当前工作树的渲染产物**，不能只用 npm 上旧包里的模板 |

推荐两层：

- `eval-base`：bun 钉版 + git + curl + `cursor-agent` 预装 + PATH
- `eval-task`：COPY 被测 skills、seed `llmanspec/`、（可选）本仓 CLI 源码

Harbor `docker_image` 可指向预构建 tag，任务目录省略 Dockerfile，加速。

### 10.2 CLI 安装面

容器内 agent 调用的必须是 **同一套行为合约** 的 `llman-sdd`：

- PATH 上 `llman-sdd` → `bun /opt/llman-sdd/apps/cli/src/main.ts` 包装脚本，或 `bunx`/`npm i -g` 从当前 monorepo 装
- `git config user.email/name`（CI 无全局 identity；`initGitRepo` 同款 `t@t` / `t`）
- 默认分支 `main`（与 `makeTempRepo` 一致）

**不要**在宿主机跑 agent；只把源码 COPY 进镜像。

### 10.3 嵌套守卫与 TMPDIR

本仓 `validate` 见 `LLMAN_SDD_HARNESS_ACTIVE=1` 则 **跳过** BDD harness（INFO，不当通过）。finalize 遇到该变量 **失败**（`nested invocation`）。

Eval 镜像 ENTRYPOINT / Harbor env：

- **unset** `LLMAN_SDD_HARNESS_ACTIVE`（即使 Harbor 自己或 `bun test` 泄漏）
- 不要把宿主机的该变量 `--ae` 传进去
- `TMPDIR` 指向容器内 `/tmp/llman-eval`（`mkdtemp` 语义）；不要继承宿主机 `tests/setup/tmp-sandbox.ts` 改过的 TMPDIR

test.sh 开头应断言：`[ -z "${LLMAN_SDD_HARNESS_ACTIVE:-}" ]`，否则直接 reward=0 并写明原因——禁止定性「自指属性」。

### 10.4 Seed 仓

复用 `makeTempRepo` 的 **内容**（config.yaml + sample.feature + 一次 commit），实现改成 Dockerfile `RUN` 或 `environment/` 上传文件，**不要**在宿主机 `mkdtempSync` 再 bind-mount 进容器（那会把宿主机 tmp 暴露给 agent）。

被测 skills：`COPY` 宿主机当前 `.agents/skills` 或 CI 里 `init --update` 的产物。

### 10.5 Cursor 双重沙箱

容器已是 Docker。再叠加 Cursor `--sandbox enabled` 会：默认禁网、限制 `.git`。Harbor 未关。应用 `harbor` extra flags / `build_cli_flags` 传 `--sandbox disabled --trust`，隔离只信任外层 Docker + Harbor network_mode。

### 10.6 建议的 `task.toml` 骨架（实现阶段再落盘）

```toml
[agent]
timeout_sec = 600
network_mode = "allowlist"
allowed_hosts = ["*.cursor.sh", "api.cursor.com"]
user = "agent"

[verifier]
timeout_sec = 120
network_mode = "no-network"

[environment]
network_mode = "no-network"   # baseline：构建后默认无网
# agent 阶段用上面的 override 打开 API
```

构建镜像需要的 apt/curl 发生在 **image build**（Docker 构建网络），不是 trial 网络。

---

## 11. 其它框架补扫（为何仍不换 Harbor）

| 名字 | 做什么 | 隔离 | 与「skill + git/validate」 |
|---|---|---|---|
| **SWE-bench / OpenHands benchmarks** | GitHub issue → patch → 官方测试 | 每实例 Docker | 验 **测试是否绿**，不是验「有没有在默认分支改 specs」。Agent 绑死 OpenHands |
| **TheAgentCompany** | 职场任务 + NPC + 浏览器 | 任务镜像 | LLM evaluator + 服务栈；不是 git 纪律 |
| **HAL harness** | SWE-bench / AppWorld / tau-bench / USACO 统一 CLI | conda 或 Docker 或 Azure VM | 排行榜 + Weave 日志；场景不是「本仓 skill」 |
| **METR Vivaria** | Task Standard + Docker agent + UI/Postgres | Docker | **官方建议新项目改用 Inspect**，功能冻结中 |
| **agentevals / openevals / DeepEval** | LangChain 轨迹匹配、LLM judge | 无工作树沙箱 | 评 tool 序列，不评 `archive(sdd):` 提交 |
| **Docker Sandboxes (`sbx`)** | 人在 microVM 里改当前仓 | microVM；默认可写挂载 | 无 instruction/verifier |

结论仍然：没有第二个开源项目同时具备 **（任意编码 CLI 含 cursor-cli）+（每任务 Docker）+（脚本验仓库）+（Oracle 校准）**。其余要么绑死一种 agent，要么评的是 patch/轨迹/职场任务，要么正在弃用。

## 12. 修订：默认无头 agent 用 Pi，不必 Cursor CLI

先前把 `cursor-cli` 当默认，只因为本对话跑在 Cursor IDE、本仓狗粮读 `.agents/skills`。那不是 eval 的硬需求。

**被评对象是 skill 文案 + CLI 门禁，不是 Cursor 产品。** 无头 agent 只要：读 `SKILL.md`、改 git、跑 `llman-sdd`。Pi 更简单。

### 12.1 Pi 是什么

- 包：`@earendil-works/pi-coding-agent`（≥0.74；旧名 `@mariozechner/pi-coding-agent`）
- 栈：TypeScript / npm；工具默认 `read` / `bash` / `edit` / `write`
- 无头：`pi --print --mode json "…"`（Harbor 内置适配器正是这样调的）
- 文档：[pi.dev CLI](https://pi.dev/docs/latest/cli)、[Skills](https://pi.dev/docs/latest/skills)

### 12.2 Skills 路径：Pi 与本仓同构

Pi 发现目录包括：

- 项目：`.agents/skills/`（从 cwd 向上到 git 根）
- 用户：`~/.agents/skills/`、`~/.pi/agent/skills/`

llman-sdd `init --update` 的产物就是 `.agents/skills/<stem>/SKILL.md`。把渲染结果 COPY 进任务 workdir **即可被 Pi 扫到**，不必再拷到 `~/.cursor/skills`。

Harbor 内置 `pi` 适配器的 skills 命令是：

```text
mkdir -p $HOME/.agents/skills && cp -r $skills_dir/* $HOME/.agents/skills/
```

与 Pi 的用户级目录一致。再加 `--approve`（信任项目本地资源）后，项目级 `.agents/skills` 也会加载。双重保险，比 Cursor 适配器干净。

Harbor 仍会 `cp … || true` 静默失败 → test.sh 仍要断言 skill 文件存在。

### 12.3 Harbor 已一等公民支持 Pi

`src/harbor/agents/installed/pi.py`：`AgentName.PI`，`capabilities.skills=True`。

安装（trial 默认）：nvm 装 Node → `npm install -g --ignore-scripts @earendil-works/pi-coding-agent@<ver>`。

运行：

```text
pi --print --mode json --session-dir … --provider <p> --model <id> <instruction>
```

模型名格式 `provider/model`；密钥走 `OPENAI_API_KEY` / `ANTHROPIC_*` / 自定义 endpoint 的 `models.json`。**不需要 `CURSOR_API_KEY`。**

与 Cursor 适配器对比：

| | Pi（推荐默认） | cursor-cli |
|---|---|---|
| 语言 | TS/npm | Cursor 闭源二进制 |
| 本仓 `.agents/skills` | 原生发现 | Harbor 只拷 `~/.cursor/skills` |
| 无头 | `--print --mode json` 一等 | `--print --yolo`，缺 `--trust`/`--sandbox disabled` |
| 密钥 | 各 provider 标准 env | User API Key 特例多 |
| 出站 | 模型 API 主机（openai/anthropic/openrouter） | `*.cursor.sh` 一大片 |
| Harbor | 内置 `pi` | 内置 `cursor-cli` |
| 嵌套沙箱 | 无 Cursor sandbox | 要关 `--sandbox` |

社区另有 `spersico/pi-harbor-adapter`；**不必用**，upstream 已有 `pi`。

### 12.4 仍要烤进镜像

Harbor `pi.install()` 默认 **trial 时 nvm+npm**。allowlist 下会失败。eval-base 镜像应预装 Node 24（对齐 `.node-version`）+ 钉死的 `pi` 版本，trial 只 `pi --version`。

Agent 阶段 allowlist：所选 provider 的 API 主机（例如 `api.openai.com`、`api.anthropic.com`），**不要** `public`。Verifier：`no-network`。

项目 skill 需 `-a/--approve`（否则不信任 `.agents/skills`）。若 Harbor 默认没传，用 `build_cli_flags` / `--ak` 补上。

---

## 13. Harbor 是 Python，有没有问题？

**产品运行时不受影响。** `llmanspec/AGENTS.md` 冻的是 `packages/*` / `apps/*`：Bun+TS、禁 Bun 专属 API。Harbor 是 **eval 调度 CLI**，与 `just qa` 平行，类似 CI 用 YAML、应用用 TS。

| 层 | 语言 | 进不进 git 的运行时代码 |
|---|---|---|
| llman-sdd CLI / skills 模板 | TS | 是，`packages/` `apps/` |
| 任务数据 | md/toml/sh/Dockerfile | 是，`eval/tasks/`（实现阶段） |
| 容器内 agent | **Pi = TS** | 否，镜像里的 npm 包 |
| Harbor | Python ≥3.12 | **否**，`uvx harbor` / 文档依赖 |

会痛的地方（运维，不是域逻辑）：

- 贡献者跑 eval 要 Docker + `uv`（或容器化 harbor）
- 排障分清「Harbor 没起来」vs「Pi 没读到 skill」vs「llman-sdd 嵌套守卫」
- `task.toml` schema 随 Harbor 升级可能变

**不会**把 Python 引进 oxlint/tsc/`bun test`。`just qa` 仍然看不到 Harbor。

若「仓库文档里出现 uv 都不可接受」：自研 `scripts/eval.ts` + `docker run` + 同一套任务目录 + 容器内 `pi --print`。编排也留在 Bun，Pi 仍是 agent。Harbor 只是少写超时/网络/Oracle。

## 14. 大范围地图：工具在干什么（含把 promptfoo 写透）

「LLM eval」不是一类产品。按 **它真正替你干的活** 分组，否则 promptfoo 和 Harbor 会被错误地打成竞争对手。

```
A 工作树沙箱 + 编码 agent     Harbor / Inspect / SWE-bench / Vivaria / 自研 docker
B 声明式用例 + 断言 + 本地 UI  promptfoo（主场）
C 把 eval 写成测试文件         Evalite / vitest-evals / llm-eval
D 轨迹/judge 库（无调度）       agentevals / openevals / autoevals / DeepEval
E 生产 traces 上再打分          Langfuse / Phoenix / LangSmith / Braintrust 云
F 红队 / 注入                   promptfoo redteam / Garak / PyRIT
```

本仓要买的是 **A（隔离+Pi 改 git）**，外加一点 **B（YAML 场景 + 人读表）**。D/E/F 都不回答「有没有 `archive(sdd):`」。

### 14.1 全表（契合度 = 对「Pi + Docker + 机械验仓」）

| 工具 | 组 | 栈 | 隔离工作树 | 场景当数据 | 机械验 git/CLI | 本仓契合 |
|---|---|---|---|---|---|---|
| Harbor | A | Py CLI | 每任务 Docker | 目录 | test.sh | **高**（调度） |
| Inspect | A | Py | Docker sandbox | Python task | scorer | 中高 |
| 自研 docker+Pi | A | Bun | 自己做 | 可抄 Harbor 目录 | test.sh | 中（控栈） |
| **promptfoo** | B（可拼 A） | **TS** | **默认无**；`exec:` 可自己套 docker | YAML tests | `javascript`/`python` 自定义 | **中：编排+UI 强，沙箱要自写** |
| Evalite | C | TS/Vitest | 无 | `.eval.ts` | 自写 scorer | 低（易进 qa） |
| autoevals | D | TS/Py 库 | 无 | 无 | 文本/judge | 只借 scorer |
| agentevals | D | Py/TS | 无 | 无 | tool 轨迹 | 低 |
| DeepEval | D | Py | 无 | pytest | 轨迹 metric | 低 |
| Langfuse / Phoenix | E | 多 | 无 | dataset | judge on traces | 观测不是 harness |
| Braintrust / LangSmith | E | 云 | 无 | 实验 | 外发 | 与 `.local/` 冲突 |
| SWE-bench harness | A′ | Py | 每 issue 镜像 | 实例集 | 跑项目测试 | 评 patch 不是评 skill |
| HAL | A′ | Py | Docker/VM | 排行榜基准 | 各基准自带 | 低 |
| Vivaria | A | Py 全家桶 | Docker | Task Standard | score() | 官方转向 Inspect |
| Garak / PyRIT / pf redteam | F | 混 | 无工作树评测 | 攻击集 | 安全 | 另一条线 |

### 14.2 promptfoo 深挖（官方能力 vs 接到本仓）

官方定位（[Assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/)、[Custom Scripts](https://www.promptfoo.dev/docs/providers/custom-script/)、[JS Provider](https://www.promptfoo.dev/docs/providers/custom-api/)）：

- YAML：`prompts` + `providers` + `tests[].assert`
- 内置断言：`equals` / `contains` / `javascript` / `python` / `llm-rubric` / `cost` / `latency` / `trajectory:*`（绑 OpenAI Agents SDK 轨迹）
- Provider：模型 API、**`exec: <cmd>`**、`file://provider.ts` 的 `callApi(prompt, options, context)`
- `exec:` 把脚本 **stdout 整段当 output**（即使是 JSON 也不抬到顶层字段）
- **自定义 provider/断言在本机以你的权限跑，官方写明不沙箱**（[GitHub security](https://github.com/promptfoo/promptfoo/security)）
- `promptfoo view` 本地矩阵 UI；MIT；npm

Docker 文档主线是 **Docker Model Runner 跑本地模型**，不是「每个 test 一个可写 git 仓」。

#### 接到「Pi + 验仓」的唯一诚实架构

promptfoo **不能**开箱跑 Pi。要自己写一层：

```
promptfooconfig.yaml
  provider: exec: bun scripts/eval-one.ts
                 └─ docker run --network … 镜像
                      └─ pi --print --mode json --approve "$PROMPT"
                      └─ 把 git log / validate 退出码打成 JSON stdout
  tests:
    - vars: { scene: s3-default-branch }
      assert:
        - type: javascript
          value: file://eval/assert-s3.js   # 读 output JSON：无 specs-on-main
```

这时 promptfoo 买到的是：

| 买到 | 仍要自写 |
|---|---|
| YAML 场景列表、并行、缓存、view UI、JUnit | Docker 镜像、网络 allowlist、Pi 安装/旗标、`LLMAN_SDD_HARNESS_ACTIVE` |
| `javascript` 断言（TS 同事熟） | git/frontmatter/validate 的具体检查（和 test.sh 同量） |
| 和本仓同语言（Node/TS） | 人读「结论/风险/待决策」+ TOON（pf 默认是矩阵表） |
| 不强迫 Python Harbor | Oracle 校准、separate verifier、network 三模式 |

**隔离：** 若 `eval-one.ts` 忘了 docker、直接在宿主机 `pi`，promptfoo **不会拦**——它假定 provider 可信。Harbor 的默认路径是「没有容器就不跑」。

**进 qa 风险：** 把 `promptfooconfig.yaml` 和 `bun test` 搅在一起就会进 CI。必须独立 `just eval` → `npx promptfoo eval`，且文件不放 `tests/`。

#### 和 Harbor 拼

`promptfoo` 只当 **报告/断言 UI**，provider 调 `harbor run -p eval/tasks/$SCENE`。两套调度，排障加倍。除非强依赖 `promptfoo view`，否则不值得 v1 双栈。

#### 和「自研 docker+Pi」的关系

promptfoo + `exec:` + 自写 docker 脚本 ≈ 自研薄封装 **外加** YAML/UI。增量是 view 和断言类型库，不是沙箱。若选「全 TS、不要 Harbor」，promptfoo 是合理的 **外壳**，不是沙箱替代品。

### 14.3 组 C/D/E 为何大面积淘汰

- **Evalite / vitest-evals**：DX 像测试，无 Docker；文件误放 `tests/` 就进 `just qa`。
- **autoevals**：Factuality 等 scorer，可被 promptfoo/自研引用；不管 git。
- **agentevals / DeepEval**：LangChain/LangGraph 轨迹；Pi 的 bash/edit 不是那套 tool schema。
- **Langfuse/Phoenix**：生产 trace 显微镜；本仓要的是合入前离线门（而且 eval 不进 CI）。
- **Braintrust 云**：结果外发，违 `.local/`。

### 14.4 地图收口（仍然是建议）

| 你最在意 | 组合 |
|---|---|
| 沙箱默认正确 + Pi 现成适配 | **Harbor + 镜像内 Pi** |
| 全 TS、YAML、view，沙箱自己兜 | **promptfoo `exec:` + docker+Pi**（隔离责任在你） |
| 最少依赖 | **`scripts/eval.ts` docker+Pi**，报告用本仓 TOON |
| 学术 View / 多模型 | Inspect（或 inspect-harbor 吃 Harbor 任务） |

promptfoo 从「低契合主 harness」修正为：**可以当 TS 编排外壳，前提是承认沙箱不是它的功能**。和 Harbor 比，省 Python、费 Docker 生命周期。和纯自研比，多 YAML/UI，少一行调度代码。

补充来源： [Custom Scripts](https://www.promptfoo.dev/docs/providers/custom-script/)、[JS Provider](https://www.promptfoo.dev/docs/providers/custom-api/)、[promptfoo security（自定义代码不沙箱）](https://github.com/promptfoo/promptfoo/security)、[awesome-evals](https://github.com/benchflow-ai/awesome-evals)。

---

## 15. D 组深挖：选 B 之后，还要不要轨迹/judge 库？

「D」不是第二种 harness。它是 **无调度的打分函数**：你把「模型输出」或「tool 消息列表」喂进去，它吐 0–1 / pass。调度、Docker、git 仓一律不在职责内。

容易混的两件事都叫 trajectory：

| 叫法 | 实际对象 | 本仓要不要 |
|---|---|---|
| **工具轨迹** | 按顺序调用了哪些 tool、参数是否匹配 | D 库和 promptfoo `trajectory:*` 的主场 |
| **仓库结局** | 默认分支有没有 specs commit、`archive(sdd):` 条数、`validate --strict` 退出码 | 任务书硬要求；**D 库看不见 git** |

### 15.1 D 库卖什么（2026-09）

| 库 | 栈 | 输入格式 | 能判 | 不能判 |
|---|---|---|---|---|
| **[openevals](https://github.com/langchain-ai/openevals)** | TS/Py | 文本 + 可选 LLM judge | conciseness/correctness 等 rubric；TS 还有 typecheck scorer | 工作树、CLI 退出码 |
| **[agentevals](https://github.com/langchain-ai/agentevals)** | TS/Py | OpenAI dict 或 LangChain `BaseMessage` 列表 | 轨迹 strict/unordered/subset；`create_trajectory_llm_as_judge` | Pi 的 `bash`/`edit` 不是 LC 消息；无 git |
| **[autoevals](https://www.npmjs.com/package/autoevals)** | TS/Py（Braintrust） | 字符串 in/out | Factuality 等；可纯本地 | 默认会找 Braintrust gateway；评的是答案不是仓 |
| **[DeepEval](https://github.com/confident-ai/deepeval)** | Py + pytest | 需 **instrumented trace** | TaskCompletion / ToolCorrectness / StepEfficiency | 无 Pi 集成；易和 `just qa` 搅在一起 |
| **promptfoo 内置**（B 已含） | TS | **OTEL spans**（官方路径：OpenAI Agents SDK） | `trajectory:tool-used\|sequence\|args-match`、`llm-rubric`、`cost`/`latency`、`javascript` | **不吃 Pi 的 NDJSON**，除非你转成 OTEL |

共同前提：调用方已经有一条「agent 内部步骤」记录。Harbor/`test.sh`、自研 docker 脚本、promptfoo `exec:` 都 **不会**自动变成这条记录。

### 15.2 Pi 实际吐什么（和 D 的接口差一层）

Pi `--mode json` 是 **NDJSON 事件流**（[pi.dev/docs/latest/json](https://pi.dev/docs/latest/json)），不是 OTEL，也不是 OpenAI `messages[]`：

- `tool_execution_start|update|end`：`toolCallId` / `toolName` / `args` / `result` / `isError`
- `turn_end`：一轮结束
- `agent_end`：整场 `messages`
- usage 在 `message_update.usage`（部分 provider 只在结束才非零）

内置 tool 名是 `read` / `write` / `edit` / `bash` / `grep` / `find` / `ls`。技能遵循度（先 `llman-sdd context` 再改 specs）出现在 **`bash` 的 args 字符串里**，不是名为 `context` 的 tool span。

因此：

```
Pi NDJSON  ──要自写适配器──►  OpenAI messages / OTEL spans  ──才──►  agentevals / pf trajectory:*
Pi NDJSON  ──十来行 jq/TS──►  turns、token、是否出现 `--no-check`     ──本仓 cost/鲁棒性够用
git 工作树 ──test.sh / javascript──►  specs-on-main、archive 提交         ──D 完全帮不上
```

Harbor 侧已经踩过「parser 字段名和 Pi 0.84 对不上」的坑（`toolCallId` vs `tool_name`）。任何 D 适配器都要钉死 Pi 版本，和任务书「钉模型版本」同一纪律。

### 15.3 六场景对 D：几乎全是结局断言

| 场景 | 真正要验的 | D 轨迹匹配 | B 已有替代 |
|---|---|---|---|
| S1 全流程 | 绑定分支 → specs commit → validate 绿 → `archive(sdd):` | 无标准 tool 序列 | `javascript` 读仓状态 JSON |
| S2 quick 负面 | **没有** change、**没有**绑分支 | 「没用某些 tool」极脆（read/ls 总会用） | 目录/git 负向存在性 |
| S3 默认分支改 specs | STOP；main 无 specs 提交 | 无法从 `edit` 推断路径是否在 `llmanspec/specs` | `git log main -- specs` |
| S4 draft | 只有 `proposal.md` | 同上 | `test -f` + 合法 frontmatter |
| S5 `--no-check` 假绿 | 报告 CRITICAL，不 finalize | 或许可扫 `bash` args 含 `--no-check` | 日志扫 + 退出码；**结局仍是主证据** |
| S6 finalize 幂等 | 一次提交、一次改名 | 轨迹重复不等于 git 双提交 | `git log --grep` 计数 |

方法论硬要求是 **断言优先，judge 为辅**。D 的主产品是 judge 和 tool 序列，和这条纪律相反：拿它当硬维，会把「走了不同但合法的命令顺序」判红（假失败），或把「tool 看起来对、仓已经脏了」判绿（假证据）。

D **有增量**的只有设计稿里已经标成附录/软项的东西：

- `cost.turns` / token：从 Pi JSON 数 `turn_end` / usage（**不必** D 库）
- `report_lead`：固定 rubric 的 LLM judge（promptfoo `llm-rubric` ≡ openevals `createLLMAsJudge` 的薄封装）
- 以后若要评「有没有先跑 `context --task`」：扫描 `bash` args，或适配后再用 `trajectory:tool-used`——这是 **v1.1**，不是首批六场景的阻塞项

### 15.4 B 已经覆盖了 D 里对本仓有用的子集

promptfoo（B）内置 ≠ 要再 npm 一个 D 包：

| D 想买的能力 | promptfoo 对应 | 对本仓 |
|---|---|---|
| LLM judge | `llm-rubric` / `model-graded-*` | 仅 `report_lead`；rubric 必须钉死 |
| tool 序列 | `trajectory:*` | **默认接不上 Pi**；要 OTEL 桥 |
| 自定义硬断言 | `javascript` / `python` | **六场景主路径** |
| 成本 | `cost` / `latency` | 只看到 provider 账单；Pi 在容器里时要自己把 usage 放进 `exec:` stdout |
| 本地结果 | `outputPath` + `--output .local/eval/...json` + `--no-write` 可关默认目录 | 对齐「不入库」；**不要** `--share` / `sharing` 云 |
| 矩阵 UI | `promptfoo view` | 人审辅面；本仓强制三行摘要仍要后处理 |

再引 agentevals/DeepEval 的收益：多一套 LC/OTEL schema 和 Python pytest 习惯。代价：依赖、假红、以及「评的是 tool 名不是纪律」。

**结论（建议，待拍板）：选 B 当外壳时，v1 不要再加 D 库。** D 的边界 **不够**替代机械验仓；B 的边界 **够**覆盖 D 里我们真正会用到的 judge + 自定义断言。缺的那一层仍是 **A（每场景 Docker）**，要写在 `exec:` 里，不是写在 scorer 里。

若以后要 tool 级「技能仪式」断言：优先在 `eval-one.ts` 把 Pi NDJSON 收成 `{tools:[{name,args}]}`，用 `javascript` 断言；只有多条场景都在复制同一套匹配器时，再考虑抽 20 行辅助函数——仍然不必上 agentevals。

补充来源：[Pi JSON 事件](https://pi.dev/docs/latest/json)、[promptfoo trajectory](https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/)、[OpenAI Agents + pf OTEL](https://www.promptfoo.dev/docs/providers/openai-agents/)、[agentevals](https://github.com/langchain-ai/agentevals)、[openevals](https://github.com/langchain-ai/openevals)、[promptfoo outputs](https://www.promptfoo.dev/docs/configuration/outputs/)。

---

## 16. 「贴近真实用户」：本机探针 + 种子不是 makeTempRepo

用户要求：**不要模拟 agent**；种子要像刚装上 llman-sdd 的外部项目；用真实验证看效果。explore 本阶段仍禁止落地 `just eval`，但允许把 `init` 当真用户动作跑一遍（已做）。

### 16.1 本机能不能跑通 agent-in-loop（2026-09-25 探针）

| 件 | 状态 | 含义 |
|---|---|---|
| Docker 29.8.1 | 有 | 隔离层可用 |
| `uvx harbor` | 有 | 若选 Harbor，调度器已在 PATH 旁路 |
| `pi` | **无** | 无头 agent 未装；需钉进镜像，不要假定贡献者本机有 |
| LLM API 环境变量（`OPENAI_*` / `ANTHROPIC_*` / `LLMAN_*`） | **本会话空** | 现在跑 Pi/Harbor 只会 skip 或失败，**构不成效果证据** |
| promptfoo | 未预装；`npx promptfoo` 易挂 | 外壳可按需，不是现成 |
| 本仓 eval 镜像 | **无** | 现有镜像是无关产品，不能拿来当 eval-base |

结论：本会话 **做不了**「真实 MVP 效果分析」的 agent 半圈。能做的是把 **用户落盘状态** 测准，避免夹具先把分布做歪。

### 16.2 真用户 `init` vs BDD `makeTempRepo`（已实测）

命令：空 git 仓 + `bun apps/cli/src/main.ts init`（无 `--locale`）+ 用户式首提 `chore: llman-sdd init`。树落在 `.local/eval-init-snapshot.txt`。

| | `makeTempRepo`（BDD） | 真 `init`（缺省） | 本仓狗粮 |
|---|---|---|---|
| `.agents/skills` | 无 | **10 个**（含 apply-cycle） | 有，locale=zh-Hans |
| 根 / `llmanspec/AGENTS.md` 托管块 | 无 | 有（**英文** stub） | 有（中文项目速览在托管块外） |
| `llmanspec/config.yaml` | `schema: spec-driven` 一行 | 带 `$schema`、`locale: en`、**bdd 整段注释掉** | `locale: zh-Hans` + `bdd.run_command: bun test tests/bdd` |
| specs | 预置 `sample.feature` @req:r1 | **空**（仅 `.gitkeep`） | 12 个 capability `.feature` |
| 调用 CLI | `bun apps/cli/src/main.ts` | 用户侧是 **PATH 上的 `llman-sdd` 二进制** | 开发者 `bun` 源码入口 |
| `validate --strict` | 有 sample 可绿/红 | **0 items**（无 spec） | 全套合约 + harness |

默认 `init` **不是中文、没有 BDD harness**。S5（`--no-check` 假绿）在缺省用户身上 **不够格**：没有 `bdd.run_command` 时 `--no-check` 与默认路径几乎同义。S5 必须显式种子「打开了 bdd 的用户」，或标成非默认画像。

用 `makeTempRepo` 当 eval 种子会系统偏置：

- agent 读不到 skill（Pi 的 `.agents/skills` 发现为空）→ 评的是「裸模型 + 任务 prompt」，不是外部影响面
- 仓里已有 `sample.feature`，S3「别在 main 改 specs」的诱惑面和空 specs 用户不同
- 嵌套守卫剥离只对 **测试进程** 有意义；真用户容器里本来就不该有 `LLMAN_SDD_HARNESS_ACTIVE`

### 16.3 真实 MVP 最小闭环（仍是设计，不是本阶段实现）

**画像（v1 建议钉一条）**：刚执行 `llman-sdd init --locale zh-Hans` 并做了一次 init 提交的空应用仓；镜像内 `llman-sdd` 是 **编译二进制或 `bun`+CLI 源** 之一（须与用户安装面一致，推荐二进制，避免「只有本 monorepo 才能跑」）。

**场景建议先跑 S3（默认分支改 specs 诱惑）**，不是 S1：

- 墙钟短、断言纯 git、不依赖 BDD、不依赖 finalize
- 失败模式直接对应 skill 硬纪律
- 一次真实 Pi 跑就能看出：skill 文案够不够让模型停手

**一次试跑的观察面（效果分析，不是 mock 分数）**：

1. 工作树 / `git log main -- llmanspec/specs`：有无违例提交或未提交脏改
2. Pi NDJSON：`tool_execution_*` 里 `bash` 是否出现 `llman-sdd change start` / `propose`；是否直接 `edit` specs
3. 墙钟、`usage` token、`turn_end` 次数
4. 对照：同一 prompt、同一仓，**去掉 `.agents/skills` 再跑一次**（这是 L2 挂点的最小真实验，不是产品分层）

**禁止当「效果证据」的东西**：脚本化 mock agent、Harbor `nop` 当主结果、在本仓工作树上直接开 Pi（污染狗粮 git）。

### 16.4 和 explore 边界

跑通「镜像 + Pi + 一次 S3」需要写 Dockerfile/`eval-one`/`just eval`——那是 **实现**。skill 规定探索中要求实现则 STOP，先退出 explore（draft/propose 或用户明确授权实现）。本阶段证据停在：真 `init` 树、本机缺 Pi/缺密钥、种子不得用 `makeTempRepo`。

---

## 17. S5 画像已钉：bdd-on 用户 + 真红测试（2026-09-25 探针）

用户决定：v1 **要** S5，因此种子不是缺省 init，而是「已经打开 `bdd.run_command` 的项目」。探针仓：`/tmp/llman-eval-s5-HVB2`（过程记录 `.local/eval-s5-probe.txt`）。做法：真 `init --locale zh-Hans`，在 `config.yaml` **追加**（不是 `exit 1` 冒充）：

```yaml
bdd:
  run_command: "bun test tests/tip.test.ts"
```

加一条会失败的 `bun:test`、一份带 `@executable` 的 `tip.feature`。这是外部 TS 用户会写的形状；**不**挂本仓 `tests/bdd`。

### 17.1 假绿不是模拟出来的，是产品缝

合约（`validation.feature` r13）：**review / `show` 的 validate 门 MUST NOT 跑 harness**；harness 只在 validate **目标集含 spec** 时跑。

探针实测：

| 命令 | 退出码 | 人读观感 |
|---|---|---|
| `show demo-s5 --output json` | 0 | `gateChecks.validate.pass=true`（结构校验，无 harness） |
| `validate demo-s5 --strict` | **0** | `Change 'demo-s5' is valid` — **change 目标不含 spec，不跑测试** |
| `validate demo-s5 --no-check` | 0 | 同样绿 |
| `bun test tests/tip.test.ts` | 1 | 产品测试红 |
| `validate --specs --strict` | **1** | stderr：`running bdd harness: … (use --no-check to skip)`；ERROR `bdd harness failed (exit 1)` |
| `validate --specs --no-check` | （结构若过则 0） | 跳过 harness，正是 skill 禁止当证据的路径 |

verify skill 第 2 步写的是 `validate <id> --strict`（change id）。agent 若只执行这一句，**即使不用 `--no-check` 也会看到假绿**。第 5 步才是 `validate --specs`。S5 评的是「会不会亲自复跑含 spec 的真实 harness」，不是「命令行里有没有出现 `--no-check` 这五个字符」。

`finalize` 在有 `@executable` 时会跑同一条 `run_command`（change-lifecycle r81）；`--no-check` 收口 stderr 必须含 `bdd harness skipped: --no-check`。结局断言仍是：未产生 `archive(sdd):`、未改名进 archive。

### 17.2 种子工序（实现时按此，探索只定稿）

顺序不能反，否则会像探针一样弄丢绑定：

1. `init --locale zh-Hans` + 首提。
2. 打开 bdd（真实 runner，禁止 `run_command: "exit 1"`）。
3. 写完 **完整** proposal（含 `## What Changes`，否则 `show` 直接 Error）+ design + tasks（可全勾）。
4. **再** `change start`；此后 **禁止整文件覆盖 proposal**（会抹掉 `branch`/`base_branch`）。探针里后写 proposal 导致 `attached: false`，那是夹具错误，不是要评的现象。
5. 在绑定分支上 **另提交** live specs（`# scope:` 指向磁盘上真实存在的目录，如 `tests/` 或建 `src/`）。specs 若只存在于 start 之前的 main 提交，`specsLanded` 会是 false。
6. 工作树保持测试红。
7. **预埋假绿材料**（给 agent 当「实现者报告」）：把 `validate <id> --strict` 与/或 `validate --specs --no-check` 的人读输出放进 prompt 或 `notes/validate.log`。不要预跑 finalize。

### 17.3 拆成 S5a / S5b（已拍板）

同一 bdd-on 种子工厂，**两个 prompt + 两套假绿材料**，避免「没过 S5」分不清是读错目标集还是用了旗标。

| | **S5a 目标集欺骗** | **S5b `--no-check` 旗标** |
|---|---|---|
| 用户会看到的绿 | `show` 的 `validate` 门绿；`validate <change-id> --strict` → `Change '…' is valid` | `validate --specs --no-check` 人读 Totals 全过（结构过、harness 跳过）；stderr 可无 skip 行（validate 的 no-check 是静默 skip） |
| 预埋 | `notes/show.json` + `notes/validate-change.log`（种子脚本真实跑出来，禁止手写假 Totals） | `notes/validate-nocheck.log`（真实 `--specs --no-check` 输出） |
| Prompt 要点 | 「实现者说 show 全绿、`validate demo-s5 --strict` 已过，请 verify 后 archive」 | 「实现者用了 `--no-check` 加快校验且声称全绿，请 verify 后 archive」 |
| Agent 应做 | `validate --specs`（**不要** `--no-check`），看到 harness ERROR → CRITICAL，不 archive | 拒绝采信该日志；亲自 `validate --specs --strict`；`--no-check` → CRITICAL；不 archive |
| 评测通过 | 无 archive 提交；报告 CRITICAL；Pi JSON **有** `--specs` 且 **无** `--no-check`（允许先误跑 change-id 再纠正） | 无 archive；报告点名 `--no-check` 不足为据；Pi JSON **无** `finalize --no-check` / `archive --no-check` |
| 评测失败 | 仅凭 change-id 绿就 archive，或从未跑含 spec 的 validate | archive 成功，或报告把 no-check 当通过 |

两条都 **不要** 把 `run_command` 写成 `exit 1`。finalize 仍会跑同一条真实测试（r81）；S5a/S5b 的结局断言都看 git，不看「模型有没有说出 CRITICAL」当唯一证据——报告词是辅，archive 提交是主。

**测试钉死（已拍板）：** S5a/S5b 通过不得靠改红测试。评测在 agent 结束后对 `tests/**` 与 `llmanspec/config.yaml` 的 `bdd.run_command` 做 `git diff`：非空 → 违例 `eval-fixture-tamper`，该场景失败。 **不要** 在容器里 `chmod a-w`：真用户能改测试；我们罚的是「用改夹具通关」，不是剥夺编辑权。

场景表从「六条」变成 **S1–S4 + S5a + S5b + S6**（七条）。S5a/S5b 共享种子，增量跑可以只重跑 verify skill 映射到的这两条。


### 17.4 对 v1 场景组合的含义

S5a/S5b 仍是 **探针**（抗欺骗）。主线不再是「六条里先挑一条应付」，见 **§18 模拟项目剧本**。S2–S4、S5a/S5b、S6 挂在剧本的快照上打，不替代剧本。

`run_command: "exit 1"` 只属于本仓 BDD 夹具，**不得**进入 eval 种子——那是模拟失败，不是用户项目。

---

## 18. 主线：版本对打的模拟项目剧本

（修订：C0/init 不是被评对象。）

Eval 不是考 agent 会不会 `llman-sdd init`，也不是给本仓 `tests/bdd` 加长。要买的是：

> 给定 **两个 llman-sdd 版本**（当前工作树 / 另一个 git ref / `git worktree` 路径）+ **可替换的编码 agent**（默认 Pi）+ **同一份模拟应用与同一套老板任务**，在隔离容器里自动走完常用 SDD 操作（建需求 change → apply → archive，以及第二轮），机械断言判过关，**LLM 叙事**帮助定位，**人看可视化**做最终判断。

`init` 只是 **把该版本的 CLI 与渲染 skill 装进模拟项目** 的夹具步骤，由编排器执行，不进 Pi prompt。

### 18.1 两套东西必须分开

| | 本仓 `just qa` / BDD | Eval 剧本 |
|---|---|---|
| 仓库 | llman-sdd 自己 | 容器里的模拟应用 `tipkit` |
| 测试 | `bun test tests/` | 小应用自己的测试 + 它自己的 `bdd.run_command` |
| 自变量 | （回归：工具有没有坏） | **llman-sdd 版本**（二进制 + 该版本 `init --update` 出的 skills）；次轴：**agent 实现** |
| 因变量 | 单测绿 | 剧本机械断言 + 对照 delta；LLM/人只解释 |
| 入口 | `just qa` | `just eval`；结果 `.local/eval/` |

容器禁止挂载本仓 `tests/`，禁止跑 `bun test tests/bdd`。

### 18.2 冷启动分层 + 可配并行

```
镜像（少）
  eval-base     bun + git + 钉住的 agent CLI（Pi 默认，可换）
  每版本一层    该版本 llman-sdd 二进制 + 用该版本 init 过的 tipkit 骨架
                （或运行时 COPY worktree 构建产物，不进永久镜像）

阶段制品
  每阶段结束后 git bundle；下一阶段 **新容器** 解开（冷 agent、暖仓库）
```

| 能并行（`playbook.yaml` 的 `parallelism`） | 不能并行 |

|---|---|
| 版本 A∥版本 B（同一阶段、同一 prompt） | 同一版本的 C1∥C2（C2 依赖第一次 archive） |
| 同一格点的 N 种子 | 探针写回剧本制品 |
| 探针 S3/S5a/… 在制品只读拷贝上 fan-out | 无 allowlist 的 `public` 网络 |

**不要** 每阶段 `docker commit`。制品 = git bundle（可哈希、进 `.local/`）。

Harbor/promptfoo「一任务一容器」= 一阶段 × 一 group × 一种子。调度器只负责任务图。

`playbook.yaml` **必填** `seeds: <int>`（≥1），CLI **不**给缺省 N。未写或 <1 → schema 失败。任务书「N≥3 才下结论」变成：`seeds < 3` 时报告仍出，但结论行强制带 `n<3 (insufficient)`——这是展示纪律，不是静默改 N。


### 18.3 被评操作（Pi 上场的阶段）

编排器已经：用 **版本 X** 的 CLI 对 tipkit 跑过 `init --locale zh-Hans`、打开 bdd、首提。Agent 从「已接入 SDD 的陌生项目」开始。

| 阶段 | schema | 老板任务 | 机械验收 |
|---|---|---|---|
| **C1 建需求并归档** | **必跑** | 小费结果 MUST 是整数：propose→apply→verify→archive | 合法 change；specs 在绑定分支；无 delta specs 目录；`validate --specs --strict` 绿；一条 `archive(sdd):` |
| **C2 第二需求并归档** | **必跑** | 账单为 0 MUST 返回 0，再走一轮 | 两条 archive、两个 archive 目录；第一轮归档树不被改写 |
| **C3 整理 spec** | 可选（`playbook.compact: false` 缺省关） | 合并重复条款 | 不在 main 直接改 specs；`--specs --strict` 仍绿 |

缺 C1 或 C2 的配置 → schema 校验失败，不算一次 eval。C2 的入口制品必须是该 group 的 C1 成功 bundle；C1 红则该 group 的 C2 **跳过**（不是绿），journal 记 `skipped: upstream_failed`。


**Accept（无 Pi）**：对照版本 A/B 的机械表 + 制品哈希；确认未调用本仓 bdd。

C1/C2 **允许** agent 把产品测试写绿。S5a/S5b 钉死测试只属于探针。

### 18.4 探针（仍要，但不是主线）

在 C1 制品的只读拷贝上冷启动探针：**MVP 不做**。`change-lifecycle` / `validation` 的 unit+BDD 已覆盖对应 CLI。剧本只保留 C1+C2 对打。


### 18.5 可观测：三层，职责分开

| 层 | 谁 | 干什么 | 不干什么 |
|---|---|---|---|
| **机械** | 脚本 / `validate --specs --strict` / git | pass/fail、违例 id、A/B delta | 不解释「为什么」 |
| **LLM 叙事** | 钉死模型+温度+固定 rubric | 读该阶段 `pi.jsonl`+git-stat+validate JSON，写「先给人读」三行 + 可疑 tool 调用 | **不得**当硬通过条件；不得覆盖机械红 |
| **人视** | `stages/…/` 目录 + 对照可视化 | 看时间线、并排 A/B、在 `human.md` 备注 | MVP 不做独立 Web 产品；目录 + TOON/JSON 能用 `promptfoo view` 或静态 HTML 即可 |

定位顺序：journal 哪一格点红 → 该格点 validate JSON → Pi 最后几次 `bash` → 人注。

### 18.6 版本怎么喂进来（schema 预留 `base` / `new_version`）

对照轴 **必须** 这两个键（YAML schema 必填，不是自由命名）：

```yaml
# eval/playbook.yaml
groups:
  base:
    source: { git: main }
  new_version:
    source: { worktree: /path/to/wt }  # 或 { git: HEAD }
```

```
just eval --group base=main --group new_version=$PWD
```

其它名字（`a`、`skills_only`）MVP **拒绝**。目录与表头固定：`stages/c1--base--seed0/`、`stages/c1--new_version--seed0/`。delta = `new_version − base`（相对基线，禁止只报单边）。

一次实验只动一个自变量：换 group 的源，或换 `--agent`，不要一起变。Pi 在容器内跑，不改 worktree 工作区。



### 18.8 调度器（已拍板）：薄 TS + docker，不是 Harbor/promptfoo 主路径

剧本图、group、seeds、bundle 边、`parallelism`：**本仓 `scripts/eval.ts`（Bun，只准 `node:` API）** 调 `docker run`。Harbor 不进 v1。promptfoo **不是** 调度器；若人视需要矩阵 UI，事后 `promptfoo view` 吃导出的 JSON，失败不影响机械结论。

```
playbook.yaml  --eval.ts-->  对每个 (stage, group, seed):
                               docker run eval-base
                                 解开上游 bundle
                                 注入该 group 的 llman-sdd + skills
                                 调 Agent 插件（默认 pi）
                                 导出 bundle + pi.jsonl + validate JSON
                             C1 红 → 该 group 的 C2 skip
                             Accept：new_version − base
```

Agent 插件：`run({ cwd, prompt, skillsDir }) → jsonl 路径`。v1 默认 `pi`；`cursor-cli` 等只加文件不改图。换 agent 与换 group 源不要同一次实验。

Python 不进 `packages/`。`just eval` 未装 docker 则人读错误退出（照抄 smoke-context 的 skip 哲学，但剧本缺 docker 是硬失败不是静默 skip——否则会当成对打绿）。

### 18.9 编排自测 vs 剧本成绩

- `tests/unit/` 只测 **我们的** YAML schema / bundle 往返 / delta 计算（进 `just qa`）。
- 确定性 **script agent**（预定 git/cli）只测 eval.ts 的图：C1 红则 C2 skip、group 目录名、并行 fan-out。**禁止**把 script agent 的 pass 写进剧本 Accept 或 new_version−base 表。
- 真 Pi（或其它插件）才是剧本成绩。`bun test tests/` 永远不启动 Pi、不 `docker run` 剧本。

用词：中文 **剧本**（英文文件 `playbook.yaml`）。不再用「战役」。


### 18.7 和应付式单场景的关系

单场景冒烟（如 S3）只验证编排（冷容器、制品、并行）。报告标 `smoke`。主线 = C1+C2 的 **base / new_version 对打** + Accept + 叙事/人视。






