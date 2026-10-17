---
depends_on: []
title: 新增 shell 补全命令，支持生成与安装五类 shell 的补全脚本
needs_specs_change: true
---

## Why

本仓当前没有任何 shell 补全能力。命令名、子命令、旗标全靠记忆与 `--help`。前代 `llman` 有此能力，本仓未移植。

### 前代口径

出处 `../llman.old-rs-impl-sdd/src/self_command.rs`：

- 命令面 `llman self completion --shell <shell> [--install] [-y]`。
- 五类 shell：bash、zsh、fish、powershell、elvish，由 clap `ValueEnum` 限定值域。
- 缺省为生成：补全脚本打到 stdout，内容从 clap 命令树动态推导。
- `--install`：把一段 marker 块写入 shell 的 rc/profile，交互确认后执行，`-y` 跳过确认。
- marker 为 `# >>> llman completion >>>` 与 `# <<< llman completion <<<`，重复安装按 marker 幂等替换。
- rc 路径：bash 取 `~/.bashrc`，缺失则回退 `~/.bash_profile` 与 `~/.profile`；zsh 取 `~/.zshrc`；fish 取 `~/.config/fish/config.fish`；powershell 取 `$PROFILE`，越出 home 即报错；elvish 取 `~/.elvish/rc.elv`。
- 非交互且未给 `-y` 时报错，不静默写入 rc。

### 本仓缺口

- `grep -rni "completion" apps/cli/src packages/core/src README.md justfile` 无补全面命中。
- 本仓没有 `self` 命令组，前代的 `llman self completion` 无直接对应入口。

## What Changes

- 新增补全命令，含生成与安装两条路径，覆盖五类 shell。
- 生成路径 MUST 从 commander 命令树推导补全内容，不另维护一份命令清单。
- 安装路径 MUST 以 marker 块写入 rc/profile，重复安装 MUST 幂等。
- 安装前 MUST 取得确认。非交互且未显式确认时 MUST 报错，MUST NOT 静默写入。
- 运行时代码 MUST 只用 `node:` 与 Web 标准 API，遵守双运行时约束。
- 补全内容 MUST 覆盖子命令与旗标两层，并随命令树变更自动跟进。
- 补全内容 MUST 覆盖 `--directory` 与报告类旗标，与命令面收敛结果保持一致。

## Open Questions

- 入口形态：根级 `completion` 命令，还是恢复 `self` 组承载。后者会新增分组层级。
- 生成器来源：自研还是引入库。引入库须评估体积与双运行时兼容。
- 是否支持 elvish。前代支持，可用性待评估。
- 交互确认形态。本仓交互提示收敛在 CLI 适配层，core 不发起终端交互。
- `--install` 写用户 home，属破坏性动作。是否需要 `--uninstall` 与 `--dry-run` 配套。
- 单二进制产物（`bun build --compile`）下是否仍按同一路径生成。

## Capabilities

| capability | 变更 |
|---|---|
| `specs/cli` | 新增补全命令的 requirement：两条路径、marker 幂等、确认门 |
| `specs/peripheral-commands` | 入口若归外围命令面，补一条命令面契约 |

## Impact

- 新增命令面，不改既有命令输出。
- 若引入补全库，须评估依赖体积与双运行时兼容。
- `--install` 会写用户 home 下的 rc 文件，须有确认门与幂等保证。
