---
depends_on: []
title: 0.11 调整前冻结命令地图与未推送提交
---

# 0.11 调整前的命令地图

0.11 计划分几次调整。动模板、skill、命令面之前，先把本地未推送提交和当前命令/配置面记下来，供后续剪枝时对照。本草案只记录，不改行为合约。

## Why

本地 `main` 比 `origin/main` 超前 4 个提交，工作区在建本草案之前是干净的。这 4 个提交还没走远程 PR。后续文案、skill、命令剪枝如果直接叠在这条历史上，发布窗口和审查边界会混在一起。

根 `AGENTS.md` 托管块里的那句说明，以及 `.agents/skills/`，都是生成物。手改会被 `llman-sdd init --update` 覆盖。调优入口在模板，不在生成物。

## What Changes

- 记录 `origin/main..HEAD` 的 4 个未推送提交，作为 0.11 窗口里已经落地、尚未推远程的部分。
- 记下托管文案与 skill 的编辑入口、共享 unit 的影响面。
- 给出当前 CLI 命令地图和 `llmanspec/config.yaml` 的全部可配置项，作为剪枝底图。
- 剪枝范围、这 4 个提交如何进 PR，留在 Open Questions，确认后再 `llman-sdd-propose`。

## 未推送提交

分支 `main`，上游 `origin/main`，超前 4，记录时工作区无其他改动。顺序从旧到新：

| 提交 | 说明 |
| --- | --- |
| `5e0505f` | `refactor(tooling): 钩子改为兼容而非跳过`。`trailing-whitespace` 用 markdown 行尾双空格保留硬换行；`check-yaml` 拆成归档卡（允许多文档）与其余 YAML（单文档）两条。 |
| `d221df3` | `docs(sdd): unfence-frozen-cards` 规划文档。 |
| `e783865` | `archive(sdd): unfence-frozen-cards`。冻结平铺卡去掉 `---` 围栏；新增 `project migrate frozen-cards-unfence`；手册在 `migrations/v0.10-v0.11/README.md`，目前这一窗口只写了这一条。 |
| `52f4566` | `test: 临时目录改用 mkdtempSync,消除并发共享`。 |

这 4 个提交已经在本地 `main` 上。要走 PR，需要先挪到分支，不能在 `main` 上直接 `gh pr create`。本草案未提交、未推送。

## 文案与 skill 的编辑入口

`init --update` 用标记 `<!-- LLMANSPEC:START -->` … `<!-- LLMANSPEC:END -->` 整段替换托管块，标记外的手写内容保留。

| 想改的东西 | 改这里 | 不要手改 |
| --- | --- | --- |
| 根 `AGENTS.md` 第 5 行那句说明，以及流水线那一段 | `packages/core/templates/zh-Hans/agents-root-stub.md` | 根 `AGENTS.md` 托管块。标记以下的「项目速览」是手写的，更新时保留 |
| `llmanspec/AGENTS.md` 托管块里的短说明 | `packages/core/templates/zh-Hans/llmanspec-agents-stub.md` | 该文件标记以下的项目规则是手写的 |
| 某个 skill 的步骤与措辞 | `packages/core/templates/zh-Hans/skills/llman-sdd-<name>.md` | `.agents/skills/llman-sdd-*/SKILL.md` |
| 多个 skill 共用的段落 | `packages/core/templates/zh-Hans/units/` | 同上。`structured-protocol` 会再嵌入 `ethics-governance` |

模板只有 `zh-Hans`。`locale` 写成 `en` 也会按契约归一成 `zh-Hans`。

改完模板后，在绑定分支上跑 `llman-sdd init --update`，把刷出来的 `.agents/skills/` 一起提交。验收要求生成物与 `tests/golden/` 在同一 config 下归一化 diff 为空；对不上时用 `bun run generate:skills-template-baseline` 更新基线，再用 `bun run check:skills-template-render` 核对。

### 默认 skill 与可选 skill

默认集（`init` 总会写入）：explore、propose、draft、apply、verify、quick、specs-compact、archive、graph、apply-cycle。

可选集（只有 `extra_skills` 点名才写入，本仓库当前未启用）：continue、ff、validate、arch-review、wayfinder、research。`init --update` 会删掉候选集之外、带 `llman-sdd-` 前缀的目录；无此前缀的自定义 skill 不动。

托管块流水线只写了 explore → propose → apply → verify → archive。draft、quick、specs-compact、graph、apply-cycle 不在这句文案里。

### 共享 unit 的影响面

改一个 unit，所有引用它的 skill 一起变。

| unit | 被谁引用 |
| --- | --- |
| `skills/git-native-flow` | explore、propose、apply、verify、ff、continue |
| `skills/index-fallback` | explore、propose、apply、quick |
| `skills/stage-guard` | apply、verify |
| `skills/human-readable-summary` | propose、verify |
| `skills/version-drift` | apply、verify |
| `skills/validation-hints` | propose、apply、verify、archive、validate、ff、continue、specs-compact |
| `skills/cli-footer` | 全部 skill 模板 |
| `skills/structured-protocol` | explore、propose、apply、verify、archive、continue、wayfinder、research、arch-review。内部再嵌入 ethics |
| `skills/ethics-governance` | 直接引用：draft、validate、ff、apply-cycle、quick、specs-compact、graph。其余经 structured-protocol |
| `spec/feature-contract` | propose |

条件变量（`buildTemplateVars`）：`specs` 段存在则 `specs_enabled`；`specs.verify_prompt` 非空则注入 verify；某个可选 skill 启用则对应 `extra_skill_<name>`。propose 用 `extra_skill_continue`，validate 用 `specs_enabled`，verify 用 `specs_verify_prompt`。

## 命令地图

注册顺序即 `--help` 顺序。来源：`apps/cli/src/program.ts` 与各 `commands/*.ts`。下面每个命令族先写本族旗标；贯穿旗标集中在后一节。

```mermaid
flowchart TB
  root["llman-sdd"]
  root --> init["init"]
  root --> validate["validate"]
  root --> change["change"]
  root --> list["list"]
  root --> show["show"]
  root --> graph["graph"]
  root --> spec["spec"]
  root --> project["project"]
  root --> archive["archive"]
  root --> review["review"]
  root --> config["config"]
  root --> index["index"]
  root --> context["context"]
  root --> self["self"]
```

裸调用根命令等于 `--help`，退出码 0。`change` / `spec` / `project` / `archive` / `index` / `self` 裸调用是用法错误，退出码 2。`config` 裸调用打印只读概览，退出码 0。

### init

`init [path]`

| 旗标 | 作用 |
| --- | --- |
| `--update` | 刷新已有安装：托管块、候选 skill、并清理候选集外的 `llman-sdd-*` |
| `--skills` | 子根也注入 `.agents/skills`。仓库根本来就会注入 |
| `--locale` / `--lang` | 互斥别名。config 里写了 `locale` 时以 config 为准；只在缺键时补上 |

### validate

`validate [item]`

| 旗标 | 作用 |
| --- | --- |
| `--all` | specs 与 changes 都验 |
| `--changes` / `--specs` | 收窄范围 |
| `--type change\|spec` | 消歧 |
| `--stage draft\|designed\|planned\|full` | change 阶段门 |
| `--strict` | WARNING 也非零退出 |
| `--all-roots` | 每个发现到的 llmanspec 根都验 |
| `--include-info` | 保留 INFO。缺省只要 WARNING 及以上 |
| `--check` | 显式跑 `specs.check_command`。缺省跳过 |

### change

| 子命令 | 参数与旗标 |
| --- | --- |
| `new [id]` | `--from`、`--verb`、`--force`、`--dry-run` |
| `start <id>` | `--branch-prefix`（盖过 `sdd.branch_prefix`）、`--base`、`--worktree` |
| `attach <id>` | `--force`、`--base` |
| `next-id` | 报告输出 |
| `archive <id>` | `--into`、`--method`、`--dry-run`。`--force` 存在但 help 隐藏。冷备不在这条命令上 |
| `diff <id>` | `--export-patch`，另加报告输出 |
| `finalize <id>` | `--into`、`--method`（盖过 `sdd.merge_method`）、`--no-check`、`--no-commit` |

`finalize` 是收口入口（校验、合并、归档改名、一笔提交）。`change archive` 是独立封口，任务门 + 合并 + 改名 + 提交。`archive freeze` 才是 7z 冷备。

### list / show / graph / review / context

| 命令 | 旗标 |
| --- | --- |
| `list` | `--specs`、`--sort recent\|name`，报告输出 |
| `show <item>` | `--type`、`-r/--requirement`。`--output` 额外接受 `meta-only`、`no-scenarios`、`reqs-only` |
| `graph [change]` | `--format`（仅 mermaid）、`--scope active\|archived\|all`、`--depth` |
| `review` | `--capability`、`--export-html`，报告输出 |
| `context` | `--task`、`--paths`、`--top`（缺省 5）、`--backend`。无报告输出 trio |

### spec

| 子命令 | 参数与旗标 |
| --- | --- |
| `skeleton <capability>` | `--force` |
| `next-req-id` | 报告输出 |
| `add-req <capability> <req_id>` | `--title`、`--body` 必填 |
| `add-scenario <capability> <req_id> <scenario_id>` | `--when`、`--then` 必填，`--given` 可选 |
| `migrate-native [paths...]` | `--dry-run`、`-y/--yes` |
| `resolve-req <req_id>` | 无额外旗标 |
| `transitions` | 静态内省 |
| `unbound` | `--limit`（缺省 1，0 表示全部），报告输出 |

### project / archive / config / index / self

| 命令 | 旗标 |
| --- | --- |
| `project dedupe-req-ids` | `--dry-run` |
| `project migrate [action]` | action：`prompt`、`strip-legacy-headers`、`frozen-cards-unfence`。`--kind toon2features\|specs-flatten`、`--from-version`、`--to-version`、`--version-expr`（已废弃）、`--dry-run` |
| `archive freeze` | `--before`、`--keep-recent`（缺省 0）、`--dry-run`、`--list`、`--ignore-file`（可重复） |
| `archive thaw` | `--change` 必填可重复、`--dest` |
| `config` | 只读五行概览 |
| `config skills` | 只读列出 `extra_skills`。写入路径已去掉，启用与否只改 config 文件 |
| `index rebuild` | `--backend`。建索引本身不调用模型 |
| `index check` | 报告输出。不新鲜则退出码 1 |
| `self completion` | `--shell` 必填、`--install`、`-y/--yes` |

### 贯穿旗标

| 旗标 | 落点 |
| --- | --- |
| `--max-scan-depth <n>` | 根命令。扫 `llmanspec/changes/` 找 `proposal.md` 的深度，最小 1，缺省 8 |
| `--directory <path>` | 除 `init`、`self completion` 外，解析实例根的命令都有。从该路径向上找最近的 `llmanspec/` |
| `--output toon\|json\|compact-json\|human` | 报告型命令。缺省 toon |
| `--json` | `--output json` 的兼容别名 |
| `--compact-json` | 必须和 `--json` 同用，否则退出码 2 |

## 可配置项

契约在 `packages/core/src/config/schema.ts`，行为在 `llmanspec/specs/config-schema.feature`。未知顶层键放行。合法顶层只有：`schema`、`locale`、`extra_skills`、`archive`、`specs`、`sdd`、`change_id`。

| 键 | 缺省 | 谁消费 |
| --- | --- | --- |
| `schema` | 必填，只能是 `spec-driven` | 加载门 |
| `locale` | `zh-Hans`。显式 `en` 也归一为 `zh-Hans` | 模板与 skill 语言；长操作进度提示 |
| `extra_skills` | 不写等于空 | `init --update` 的可选 skill 候选 |
| `archive.strict_defer` | `false` | 未勾选且无 defer 链接的任务：true 时当错误 |
| `specs.framework` | `""` | 只在 `check_command` 未设时推导缺省检查命令 |
| `specs.check_command` | 不跑 | `validate --check` 与 finalize 预合并。含 `{feature_path}` / `{feature_dir}` / `{feature_name}` 则按 capability 跑；无占位符则整批一次 |
| `specs.verify_prompt` | 无 | 注入 verify skill |
| `sdd.branch_prefix` | `sdd/` | `change start`。旗标 `--branch-prefix` 优先 |
| `sdd.worktree_root` | 仓库根的兄弟目录 | `change start --worktree` |
| `sdd.worktree_naming` | `id`（或 `hash`） | worktree 目录名 |
| `sdd.merge_method` | `squash`（或 `ff`） | finalize / archive。旗标 `--method` 优先 |
| `change_id.pattern` | `^[a-z0-9][a-z0-9-]*$` | 加载时编译；`validate` 对活跃 change 目录名强制。`change new` 不因 pattern 拒绝 |
| `change_id.template` | 无 | `change new --from` 渲染 id 时使用，可用 `--verb` |

加载期兼容，不是可配置项：旧 `bdd` 段提升为 `specs`（`run_command` → `check_command`）并在 stderr 警告；已删除的 `specs.check_transitions` 剥掉并警告，改用场景上的 `@transitions` / `@no-transitions`。

`config` 概览只显示 schema、locale、extra_skills 启用数、specs 开关、archive 是否 configured（仅当 `strict_defer: true`）。`sdd` 与 `change_id` 不出现在这五行里。

### 环境变量

这些不进 `config.yaml`。

| 变量 | 作用 |
| --- | --- |
| `LLMAN_SDD_INDEX_BACKEND` | `context` / `index` 的后端。旗标 `--backend` 优先。空值与 `page-index` 都当作 pageindex。`rag` 直接报错 |
| `LLMAN_SDD_INDEX_CHAT_MODEL` | pageindex 检索要的可工具调用模型。`index rebuild` 不需要它；`context` 在索引新鲜但此变量空时不可用 |
| `LLMAN_SDD_INDEX_CHAT_API_HOST` / `LLMAN_SDD_INDEX_CHAT_API_KEY` | 聊天端点。缺省回退到下面的 `OPENAI_*` |
| `LLMAN_SDD_INDEX_OPENAI_API_HOST` / `LLMAN_SDD_INDEX_OPENAI_API_KEY` | 上一项的回退 |
| `LLMAN_SDD_HARNESS_ACTIVE` | 嵌套守卫。外层 validate 设为 `1` 时内层跳过 harness。测试子进程要剥掉 |
| `LLMAN_SDD_VERSION` | 构建期注入的版本显示 |
| `LLMAN_SDD_EMBEDDED_TEMPLATES` | 编译进二进制的模板表 |
| `LLMAN_SDD_EMBEDDED_7ZZ_WASM_B64` | 编译进二进制的 7z wasm |

上文命令地图与配置表是剪枝前的底图。下面是已定口径。

## 已定口径

依据 [Agent Skills 规范](https://agentskills.io/specification)（2026）：发现阶段宿主只加载 `name` 与 `description`，命中后才读全文。`description` 须同时写做什么、何时用，并前置触发词。Cursor、Claude Code、Codex、DSH（DeepSeek Harness）都从 `.agents/skills/` 自动发现，把名字和描述放进目录；DSH 每条描述截断约 500 字，Codex 在上下文预算不够时先缩短描述。因此描述要短，约束写在开头。

手动 skill 不能只在正文里写「仅手动」。正文在发现阶段看不见。Cursor / Claude Code / DSH 认 frontmatter `disable-model-invocation: true`（命中后不自动加载）。Codex 不认这个字段，要在技能目录放 `agents/openai.yaml`，`policy.allow_implicit_invocation: false`。两边都做。描述以 `仅手动。` 起句，避免 Codex 缩短描述时把限制裁掉。

| 项 | 口径 |
| --- | --- |
| 根 `AGENTS.md` | `init` / `--update` 不再写入、并移除已有 `LLMANSPEC` 托管块，标记外的手写段保留。技能发现不靠这段文案 |
| `llmanspec/AGENTS.md` | 保留。这里是项目规则，不是技能目录 |
| skill 安装 | 去掉 `extra_skills` 与 `config skills`。`init --update` 写入全部 `llman-sdd-*` 模板，并清掉已退役的同前缀目录 |
| 描述 | 自动技能：先写何时用，再写不用于什么。手动技能：`仅手动。` 起句，加上面的两个开关 |
| 手动技能 | 已有开关：apply-cycle、wayfinder。补上：specs-compact（正文写了手动，发现阶段仍会被选中）、ff（和 propose 抢同一条路径） |
| 收口 | 技能名保持 `llman-sdd-archive`。`change finalize` 并入 `change archive` 后删除。冷备父命令 `archive` 改为顶层 `freeze` 与 `thaw`，不放进 `change freeze` |
| 绑定 | 只留 `change start`。在默认分支上建 `sdd/<id>`；已在功能分支上则绑定当前分支（今天的 attach，含 `--force` 重绑）。`--worktree` / `--base` 留在 start 上。删 `change attach` |
| 脚手架 | `change new` 与 `spec skeleton` 不合并。前者建 change 目录，后者建 `.feature`。`spec skeleton` 改名为 `spec new`，动词与 `change new` 对齐 |
| 一次性迁移 | 删除 `spec migrate-native`、`project migrate strip-legacy-headers`、`project migrate --kind`、`--version-expr`。保留 `project migrate` 总览、`prompt` 版本手册、`frozen-cards-unfence`。`project dedupe-req-ids` 是修复重号，不是迁移，保留 |
| index / context | 一并删除。`context` 是唯一读者；未设 `LLMAN_SDD_INDEX_CHAT_MODEL` 时技能已经退回 `list --specs` 加直读 `.feature`。索引没有第二个消费者。版本戳从 `llmanspec/.context/sdd-state.json` 挪走 |
| 构建注入变量 | `LLMAN_SDD_VERSION`、`LLMAN_SDD_EMBEDDED_TEMPLATES`、`LLMAN_SDD_EMBEDDED_7ZZ_WASM_B64` 改为 `LLMAN_SDD_DEV_BUILD_` 前缀。`LLMAN_SDD_HARNESS_ACTIVE` 留着（运行时嵌套守卫）。`LLMAN_SDD_INDEX_*` 随 index/context 删除 |
| 技能版本检查 | 用 `llman-sdd init --check`，不用 `validate --version`（与根命令 `--version`、以及 validate 的门禁职责撞车）。读每个 `.agents/skills/llman-sdd-*/SKILL.md` 的 `metadata.version`。主版本号与次版本号都与当前 CLI 相同则兼容，补丁号可以不同。缺文件、读不出版本、或主/次版本不同：非零退出，提示 `llman-sdd init --update`。既有的一次性 stderr NOTE 改为指向这条命令，不把日常命令变成失败 |

`change archive` 吸收 finalize 的合并前校验（`--no-check` 可跳过）和 `--no-commit`，并保留自己的干净工作区拒绝，避免 `git add -A` 卷进无关改动。隐藏的 `--force` 不保留。

## 提案拆分

实现不在本草案。四份规划文档按依赖串行，迁移手册 `migrations/v0.10-v0.11/README.md` 由它们依次追加，避免并行改同一文件。

| 顺序 | change | 内容 |
| --- | --- | --- |
| 1 | `refresh-skill-discovery` | 停写根托管块、描述与手动开关、始终注入全部技能、删除 `extra_skills` / `config skills`、`init --check` |
| 2 | `unify-command-surface` | `change archive` 吸收 finalize；顶层 `freeze` / `thaw`；`change start` 吸收 attach；`spec new`；删除一次性迁移命令 |
| 3 | `drop-index-and-context` | 删除 index / context，版本戳挪出 `.context/` |
| 4 | `prefix-build-defines` | 三个构建注入变量改为 `LLMAN_SDD_DEV_BUILD_`。无规格变更 |

## Open Questions

- 已在本地 `main` 上的 4 个提交：挪到独立分支再开 PR，还是直接推 `origin/main`？挪分支之前不要在 `main` 上再提交本草案。

## Capabilities

无。本草案不改 `llmanspec/specs/`。正式化后的 change 会改。

## Impact

- 本文件只记录口径。未改模板、CLI、specs。
- 前三份改行为合约。`prefix-build-defines` 不改规格，`needs_specs_change: false`。
