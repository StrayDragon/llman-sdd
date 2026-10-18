---
depends_on: []
title: 新增 self completion 补全命令，支持生成与安装五类 shell 的补全脚本
needs_specs_change: true
branch: sdd/shell-completion
base_branch: main
base_sha: c793cb0bdafecea3b739bb29283d85c9c2ff834c
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

- 新增 `self` 命令组（2026-10-18 用户定案：前代 parity 优先于根级扁平），其下 `self completion` 承载生成与安装两条路径，覆盖五类 shell。
- 生成路径 MUST 从 commander 命令树推导补全内容，不另维护一份命令清单。
- 安装路径 MUST 以 marker 块写入 rc/profile，重复安装 MUST 幂等。
- 安装前 MUST 取得确认。非交互且未显式确认时 MUST 报错，MUST NOT 静默写入。
- 运行时代码 MUST 只用 `node:` 与 Web 标准 API，遵守双运行时约束。
- 补全内容 MUST 覆盖子命令与旗标两层，并随命令树变更自动跟进。
- 补全内容 MUST 覆盖 `--directory` 与报告类旗标，与命令面收敛结果保持一致。

## Capabilities

- 新建 `specs/completion.feature`（2026-10-18 用户定案：主题独立，不并入 peripheral-commands）。

## Open Questions

无（入口形态 self 组、capability 归属、双 seam 均已定案）。

## Non-Goals

- 前代 `self schema` 子命令不在本 change 范围（draft 原始范围仅 completion；如需另案）。
- 不做补全脚本的静态缓存/持久化（每次现算，与重扫描即真相精神一致）。
