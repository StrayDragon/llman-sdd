---
depends_on: []
title: CLI 失败给出下一步且无草稿可从规格校验
branch: sdd/improve-cli-failure-next-steps
base_branch: main
base_sha: 8426295c6aa377b8b66606829739fd61a8885acf
---

# CLI 失败给出下一步且无草稿可从规格校验

## Why

新仓没有 Studio 草稿时，`studio validate|diff|prompt` 只报「先建草稿」，没有可执行下一步；CLI 本身也没有建草稿命令。`studio-onboard` 技能第 3 步因此在新仓必失败。找不到 id 时不列候选；裸调纯父分组多一行空的 `Error:`；`studio open --help` 默认值重复。目标是让每个失败都给出下一步，并让「新仓一条命令看到规格里状态机的校验结果」成立。

## What Changes

- 无草稿时 `diff`/`prompt`/`apply`/`revise` 报两行：`Error:` 首行 + `Next:` 建议行；退出码不变。
- `studio validate` 新增 `--specs`：不读草稿，对抽取结果跑 `validateMachineGraph`。无草稿且未给 `--specs` 时自动按 `--specs` 执行，输出头标注 `source: specs`。
- 找不到 id 时最多列出 5 个候选（前缀 → 子串 → 编辑距离 ≤2）；`show`、`studio` 子命令、`change` 系共用同一 helper。
- 纯父分组裸调保持 help + 退出码 2，不再输出空的 `Error:` 行。
- 去掉 help 默认值重复；`studio` 描述覆盖 machine/flow/decision。
- `studio open`/`serve` 启动成功打印一行 `Studio: http://127.0.0.1:<port>/ (workspace <name>)`。

## Capabilities

- `studio-cli`：无草稿降级、`--specs`、错误带下一步、裸调空 Error、help 文案。
- `cli`：not-found 候选与纯父分组空 Error 出口。

## Impact

- 不新增 studio coverage、不改 MCP、不改 Hub/server、不改 Web、不改 skill 正文、不改退出码约定。
- 新增 `--specs` 旗标，须在绑定分支 `init --update` 并刷新 golden。
