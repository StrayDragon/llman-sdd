# 技能发现

## 手动技能的三道开关

发现阶段看不见正文，所以「仅手动」不能只写在正文里。

| 层 | 谁认 | 作用 |
| --- | --- | --- |
| 描述以 `仅手动。` 起句 | 所有只看描述的宿主，包括会从末尾截断描述的 Codex | 截断后限制还在 |
| `disable-model-invocation: true` | Cursor、Claude Code、DSH | 不进入模型的自动加载 |
| `agents/openai.yaml` 里 `allow_implicit_invocation: false` | Codex | 不进入隐式目录，仍可用 `$技能名` 调用 |

自动技能的描述先写触发，再写排除，例如 continue 只补已有 change 的缺口，不用来开新变更。

## 版本检查放在 init

`validate --version` 和根命令 `--version` 撞名，也和 validate 的门禁职责混在一起。`init --check` 和补救命令 `init --update` 成对。

兼容窗口是主版本号与次版本号相同。`0.11.0` 的技能对 `0.11.3` 的 CLI 算兼容；`0.10.x` 不兼容。依据是 `SKILL.md` 的 `metadata.version`，不是 `sdd-state.json`。状态文件只给那条一次性 NOTE 用，NOTE 改口指向 `init --check`。

## 根 AGENTS.md

`--update` 删除托管块时只动两个标记之间的内容，包括标记本身。标记外的手写段，包括本仓库的「项目速览」，保持不动。没有标记的根 `AGENTS.md` 原样保留，不预插一块再删掉。
