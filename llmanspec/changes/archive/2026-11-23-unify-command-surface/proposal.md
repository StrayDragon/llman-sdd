---
depends_on:
  - refresh-skill-discovery
title: 收口并入 change archive，冷备改为 freeze
branch: sdd/unify-command-surface
base_branch: main
base_sha: 8dbe60cfb393982747e4c25e367cfbe2ff92d001
---

# 收口并入 change archive，冷备改为 freeze

## Why

收口有两条命令，最后都做合并、改名、提交。`change finalize` 多了合并前校验；`change archive` 多了干净工作区检查。技能名叫 `llman-sdd-archive`，正文却让人跑 `change finalize`。冷备的父命令也叫 `archive`，和收口抢同一个词。

`change start` 与 `change attach` 是同一件绑定的两扇门。`spec skeleton` 与 `change new` 都是在建空脚手架，动词却不一样。`spec migrate-native`、`strip-legacy-headers`、`--kind`、`--version-expr` 服务的是已经过去的迁移。

## What Changes

- `change archive` 成为唯一收口。吸收 `change finalize` 的合并前 `validate` 扫描、`--no-check`、`--no-commit`、harness 嵌套检查，以及目标 worktree 内执行。保留干净工作区拒绝。删除隐藏的 `--force`。删除 `change finalize`。
- 冷备不再有 `archive` 父命令。`archive freeze` 改为顶层 `freeze`，`archive thaw` 改为顶层 `thaw`，旗标保持今天的集合。不新增 `change freeze`：冷备一次处理多份已归档条目，不是给一个活跃 change 收口。
- `change start` 吸收 `change attach`。在默认分支且工作区干净时创建 `sdd/<id>` 并绑定；已在其他分支上时绑定当前分支，`--force` 允许重绑。`--worktree` 与 `--base` 留在 start。删除 `change attach`。
- `spec skeleton` 改名为 `spec new`。删除 `spec migrate-native`、`project migrate strip-legacy-headers`、`project migrate --kind`、`--version-expr`。保留 `project migrate` 总览、`prompt`、`frozen-cards-unfence`，以及 `project dedupe-req-ids`。
- 技能 `llman-sdd-archive` 保持这个名字。描述和正文改为运行 `change archive`。其他模板、完成脚本、本仓库 `llmanspec/AGENTS.md` 里提到 finalize、attach、skeleton、migrate-native、`archive freeze` 的句子一并改口。
- `migrations/v0.10-v0.11/README.md` 追加命令替换表。这是破坏性变更：旧命令名退出后没有别名。

## Capabilities

- `change-lifecycle`：收口只剩 `change archive`；绑定只剩 `change start`。
- `review-freeze`：冷备命令改为 `freeze` / `thaw`。
- `cli`：顶层命令名单去掉 `archive`，加上 `freeze` 与 `thaw`。
- `completion`：补全词与新的命令树一致。
- `peripheral-commands`：`project migrate` 只保留总览、`prompt`、`frozen-cards-unfence`。
- `spec-authoring`：`spec new` 取代 `spec skeleton`。
- `spec-parsing`、`validation`：旧标签仍惰性解析，不再提供 `spec migrate-native`。
- `scope-boundaries`：删掉把 `spec migrate-native` 的路径参数当作写豁免的条款。
- `monorepo-structure`：交互确认不再以 `spec migrate-native` 为唯一交互点。

## Impact

- 依赖 `refresh-skill-discovery`。技能描述那一轮落地之后，再改技能正文里的命令名。
- 脚本、文档、eval 里写死的 `change finalize`、`change attach`、`archive freeze`、`spec skeleton`、`spec migrate-native` 会失效。升级手册给出替换，不留别名。
- 绑定分支之后才能改 `llmanspec/specs/`。
