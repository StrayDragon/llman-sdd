# language: zh-CN
# capability: eval-playbook
# purpose: 规范外部用户影响面的 Harbor 剧本评测：独立镜像、只读挂载 worktree/种子、容器内拷贝后由 agent 走两轮 SDD，Pi 注入 openai-responses+thinking max，结果按 run 结构化留存且不进 qa/golden。
# scope: tests/unit/eval-groups-schema.test.ts, justfile, eval/

功能: eval-playbook

  @req:r82
  规则: Harbor 剧本不进入 qa 与 golden
    外部影响面剧本评测 MUST 以 Harbor 为唯一调度(Docker 隔离、无头 agent、Reward Kit 机械准则);MUST NOT 把 `harbor run`、真 Pi
    或剧本基线纳入 `just qa` / `bun test tests/` / golden;缺 Docker、Harbor、Pi 或模型端点时 MUST 非零退出,MUST NOT skip 成绿。

    场景: qa 套件不启动 harbor
      假如 工作目录是仓库根
      当 执行命令 "bun test tests/unit/eval-groups-schema.test.ts"
      那么 退出码为 0

  @req:r83
  规则: groups 至少一组且比较组可选
    `eval/groups.yaml` 的 `groups` MUST 为名字自定的映射且 MUST 至少含 1 个 group;第二组及以后(如 experiment) MUST
    为可选;`worktree` 缺省、空或 null 时 MUST 解析为当前仓库根;`baseline` 若出现 MUST 为 `groups`
    中的一个键(缺省映射第一项);`n_attempts` MUST 由 YAML 提供且比较结论在次数小于 3 时 MUST 标明 `n<3 (insufficient)`;一次 run 的结果
    MUST 写入 `.local/eval/runs/<id>/`(含 config 快照、每 group 的 Harbor job 目录、相对 baseline 的 rollup),MUST NOT
    覆盖更早 run,MUST NOT 入库。

    场景: groups 文档校验接受单组与空 worktree
      假如 工作目录是仓库根
      当 执行命令 "bun test tests/unit/eval-groups-schema.test.ts"
      那么 退出码为 0

  @req:r84
  规则: 独立镜像只读挂载并在容器内拷贝
    eval 镜像 MUST 不含某一版 llman-sdd 源码,MUST NOT 因更换 group 或改种子而重建;被测 worktree 与 demo 种子 MUST 以只读 bind
    挂入容器,再由 `setup.sh` 拷到容器内可写 `/app` 后执行 `init` 与 agent;`init` MUST NOT 作为被评阶段;Harbor 步骤目录名 MUST 与
    `[[steps]].name` 一致且带含义(缺省 `c1-tip-integer-archive` 与 `c2-zero-amount-archive`);两轮 MUST 在同一容器延续 git
    历史,第一轮机械未达 `min_reward` 时 MUST 中止且 MUST NOT 跑第二轮;eval MUST 仅使用本地 Docker provider。

    场景: groups 文档校验仍接受可选第二组
      假如 工作目录是仓库根
      当 执行命令 "bun test tests/unit/eval-groups-schema.test.ts"
      那么 退出码为 0

  @req:r85
  规则: 机械准则优先且并发尽量为 2
    裁判 MUST 以程序化准则验收 git/frontmatter/`validate --specs --strict`/archive 提交次数,MUST NOT 把
    `validate <change-id>` 或 `--no-check` 当作绿;LLM judge MVP MUST NOT 作为通过门槛;Harbor
    `n_concurrent_trials` MUST 为 2 且 group 之间 MUST 串行,以尽量使全局 LLM API 同时进行的 trial 不超过 2。

    场景: n_attempts 缺失被校验拒绝
      假如 工作目录是仓库根
      当 执行命令 "bun test tests/unit/eval-groups-schema.test.ts"
      那么 退出码为 0

  @req:r86
  规则: Pi 注入完整 Responses API 配置且 0731 默认思考 max
    `just eval` MUST 根据 `eval/groups.yaml` 生成容器内 Pi 的 `models.json`(缺省 provider `fusionsparks`, `api`
    MUST 为 `openai-responses`, 含 thinkingLevelMap 与 chat-template compat)并只读挂到 `/opt/pi-seed`,由 wrapper
    拷到可写 `/tmp/pi-config`(Harbor bind 仅允许 RO,Pi 需写 auth.json);MUST NOT 向 Harbor 导出 `OPENAI_BASE_URL`
    以免其用精简 `harbor-endpoint` 覆盖;Harbor `-m` 对无斜杠的 model id MUST 使用 `fusionsparks/<id>`;`--thinking` 缺省
    MUST 为 `max`(至少对 `deepseek-v4-flash-0731`)。

    场景: Pi models.json 使用 Responses API 且 0731 thinking 为 max
      假如 工作目录是仓库根
      当 执行命令 "bun test tests/unit/eval-groups-schema.test.ts"
      那么 退出码为 0

  @req:r98
  规则: skill 文风观测断言与 A/B 文风对照
    eval 套件 MUST 含 skill 文风观测断言(如 tests/skill_style):读取容器内 /app/.agents/skills 的 SKILL.md,统计强度词表外词与直角引号计数并写入 /logs/verifier/,该断言 MUST 为观测维度恒真,MUST NOT 作为通过门槛,MUST NOT 改变 reward 聚合语义;文风对照经 groups 双 group(stable 为基线模板 worktree,对照组为修订模板 worktree)与既有 n_attempts 语义完成,rollup 记录 exitByGroup 供趋势比较;runner 侧模型 API 配置变更不在文风对照范围。

    场景: eval 文风断言随套件被发现
      假如 工作目录是仓库根
      当 执行命令 "ls eval/tasks/playbook/tests/skill_style/check.py"
      那么 退出码为 0
