---
depends_on: []
title: 技能改为目录发现并始终注入
---

# 技能改为目录发现并始终注入

## Why

Cursor、Claude Code、Codex、DSH 都从 `.agents/skills/` 发现技能，启动时只把 `name` 和 `description` 放进目录，命中后才读正文。根 `AGENTS.md` 里的流水线托管块不参与这次挑选，却会在 `init --update` 时整段重写，和项目自己的手写规则缠在一起。

`extra_skills` 默认关着 6 个技能，调用方还要再跑 `config skills` 才能看见。手动技能把「仅手动」写在描述末尾，描述被截断之后模型仍然会选中它们。

## What Changes

- `init` 与 `init --update` 不再写入根 `AGENTS.md` 托管块。`--update` 遇到已有 `<!-- LLMANSPEC:START -->` … `<!-- LLMANSPEC:END -->` 时删掉这一段，标记外的手写内容原样保留。
- `llmanspec/AGENTS.md` 的托管短说明继续写。项目规则仍放在该文件标记之下。
- 从配置契约删除 `extra_skills`。旧文件里留下的这个键按未知键放行，加载不报错，`init` 不读它。
- 删除 `config skills`。`config` 概览不再打印 extra_skills 计数。
- `init --update` 渲染并写入全部 `llman-sdd-*` 模板，并删除候选集之外、带此前缀的目录。无此前缀的自定义技能不动。
- 重写每条 `description`：先写何时用，再写不用于什么，控制在宿主截断之后仍能判断。手动技能以 `仅手动。` 起句。
- 以下技能同时写 `disable-model-invocation: true`，并在技能目录放 `agents/openai.yaml`（`policy.allow_implicit_invocation: false`）：`llman-sdd-apply-cycle`、`llman-sdd-wayfinder`、`llman-sdd-specs-compact`、`llman-sdd-ff`。前两个已有 frontmatter 开关，描述起句和 Codex 策略文件仍要补。
- 新增 `llman-sdd init --check`。读取 `.agents/skills/llman-sdd-*/SKILL.md` 的 `metadata.version`。主版本号与次版本号都等于当前 CLI 则退出码 0。缺技能、读不出版本、或主/次版本不同则非零退出，并提示 `llman-sdd init --update`。补丁号可以不同。
- 现有的一次性 stderr 版本 NOTE 改为指向 `init --check`。日常命令不因此失败。
- 升级说明写入 `migrations/v0.10-v0.11/README.md`：删掉 `extra_skills`，再跑 `init --update`。根托管块会被剥掉。

## Capabilities

- `init-generators`：根托管块不再写入、`--update` 剥离、全部技能注入、`init --check`。
- `config-schema`：顶层字段不再包含 `extra_skills`。
- `config-command`：去掉 `config skills` 与概览里的 extra_skills 行。

## Impact

- 下游仓库下次 `init --update` 会失去根目录那段流水线提示，技能目录变成唯一入口。
- 六个原先默认关闭的技能会进入目录。其中 `ff` 与 `specs-compact` 标为仅手动，避免和 propose、日常流水线抢触发。
- 行为合约变更。绑定分支之后才能改 `llmanspec/specs/`。
