# design

## 强度词边界定案（用户确认）

同一语言内强度词汇表唯一；跨语言各守各表。

| 语言 | 要求 | 推荐 | 允许 | 能力 |
|---|---|---|---|---|
| zh-Hans | 必须 / 不得 | 宜 / 不宜 | 可 / 不必 | 能 / 不能 |
| en | MUST / MUST NOT | SHOULD / SHOULD NOT | MAY | CAN |

- zh 模板正文禁裸 `MUST`/`SHALL`（含 `MUST NOT`），en 模板禁中文四级词——**例外**：引用 spec 合约原文的语句（如 apply 模板 “specs 的 MUST/SHALL 逐条落实”）保留被引对象词汇；白名单在 parity 测试中以正则排除段维护。
- zh 步骤句祈使豁免（I1/GraB T 1.1 先例）：顺序操作步骤写动词开头，不加必须。
- `**加粗**` 不承载强度语义，仅视觉强调——强度一律由四级词表达。

## 分层门禁（不盲信 STC 的机制化）

1. STC = lint 层（文风/强度/行话/引号），`--json` errors 计数 + per-file 基线（只许下调）。
2. 语义层 = 既有 `template-guidance-parity`（forbidden/required 标记）+ `template-command-parity`（命令面）+ golden 渲染门；STC 红不了语义，语义门红不了文风。
3. 豁免通道 = `stc-disable-next-line` 行注释（STC 原生），须附理由。
4. 基线下调随 change 记录理由（同 pending-gate 惯例）。

## r2 对账联动（四处同步，缺一红）

`tests/bdd/assert/quality-gates.ts` 锁定 qa 集合于 justfile/package.json/ci.yml 三处。本 change 扩 `check:stc` 必须同步：justfile qa recipe 加行、package.json `qa` 字符串扩段、ci.yml test job 加 run 步、quality-gates.ts 期望集加 `check:stc`。先改对账断言再改四处，TDD 顺序：红→四处接线→绿。

## check-stc 实现要点

- devDependency `@daimonia/stc`（0.2.1，零运行时依赖，Node≥18；bin `stc`）。
- `scripts/check-stc.ts`：遍历 `packages/core/templates/zh-Hans/**`（.md），spawn `stc check <file> --profile for-instruction-writing --json`，取 `errors`，对照 `scripts/stc-baseline.json`（`{ path: maxErrors }`）；缺失文件键=0 容错新增；超限逐条报 `path errors>max`。
- en 模板不进 stc（STC 只管中文，实测 en 0 错无意义）。

## eval A/B 挂点（零 runner 改动）

- `eval/run.ts` `--skill` 指向 `worktree/.agents/skills`；`groups.yaml` 双 group：`stable`（基线 worktree/空=当前仓）与 `stc`（本 change 分支 worktree 路径），`baseline: stable`；各 `n_attempts: 3`。
- 新断言 `eval/tasks/playbook/tests/skill_style/check.py`：读 `/app/.agents/skills/*/SKILL.md`，统计四级词表外强度词（`禁止|勿|不要|应`…）计数与 `「」`计数，写入 `/logs/verifier/`；返回恒 true（观测维度，不阻断）——reward 聚合 `all-pass` 语义不变，A/B 比较两组 reward 率与轨迹。
- runner API 配置（OPENAI_BASE_URL/model）变更遗留后续，不在本 change。

## PoC 先例（已验证可行，st@{0} stc-poc-wip）

stage-guard + ethics-governance 两 unit 修订 → STC 9+2→0 错 → 6 skill 渲染产物联动 → golden 门绿 → 319 单测绿。全量修订同路径放大。

## 附录:harbor/Pi/模型调研备忘(2026-10-11 实证,apply T10 后补录)

- Harbor 0.24.0 密钥通道:`--ae KEY=V`(agent 级,重复)/`--env-file`(job 级)/task.toml `[environment].env`(支持 ${VAR} 模板)→运行时 scoped exec-env 注入容器;logs 密钥自动 `[REDACTED]`(trial.py `_scrub_jobs_dir`)。密钥不落 task 目录。
- Pi(1.1.0 checkout,0.85.x 同构):models.json `apiKey` 支持 `$VAR`/`${VAR}`/`!command` 插值——**密钥可零落盘**;凭据优先级 `--api-key`>`auth.json`>models.json apiKey>env;内置 `zai-coding-cn` provider(bigmodel coding 端点,`ZAI_CODING_CN_API_KEY`,glm-5.3-flash thinkingLevelMap 齐,`thinkingFormat:"zai"`)。
- GLM-5.3-Flash(bigmodel 口径,zcodingplan.cn 无公开文档):chat completions `https://open.bigmodel.cn/api/coding/paas/v4`、responses 另在 `/api/v1`、anthropic `/api/anthropic`;模型 id `glm-5.3-flash`;thinking 仅 enabled(不可关)。
- 后续切 zai 路径(不属本 change):groups-schema `apiKey` 改 `$VAR` 引用 + provider `zai-coding-cn` + api `openai-completions` + harbor `--env-file eval/.env`(gitignored);eval/run.ts 会改写 base_url 为 host-gateway 代理,env 侧无需 OPENAI_BASE_URL。现 vLLM 直连架构 `'not-needed'` 字面量已最小暴露面,不动。
