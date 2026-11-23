---
depends_on:
  - drop-index-and-context
title: 构建期注入改用 DEV_BUILD 前缀
needs_specs_change: false
---

# 构建期注入改用 DEV_BUILD 前缀

## Why

这三个变量只在 `bun build` 的 define 里被替换，用来把版本号、模板表和 7z wasm 编进二进制。它们和用户的 `llmanspec/config.yaml`、索引环境变量放在同一 `LLMAN_SDD_` 前缀下，读代码时会当成可配置项。

## What Changes

构建脚本和读取处的字面量 `process.env.<NAME>` 一起改名，否则 define 替换不到：

| 现在 | 改为 |
| --- | --- |
| `LLMAN_SDD_VERSION` | `LLMAN_SDD_DEV_BUILD_VERSION` |
| `LLMAN_SDD_EMBEDDED_TEMPLATES` | `LLMAN_SDD_DEV_BUILD_EMBEDDED_TEMPLATES` |
| `LLMAN_SDD_EMBEDDED_7ZZ_WASM_B64` | `LLMAN_SDD_DEV_BUILD_EMBEDDED_7ZZ_WASM_B64` |

`LLMAN_SDD_HARNESS_ACTIVE` 不改。它是 validate 拉起 `specs.check_command` 时设置的运行时嵌套守卫。

`migrations/v0.10-v0.11/README.md` 加一小节：这三个名字从未是用户配置，自定义构建脚本若写死了旧的 define 键，要跟着改。

## Capabilities

无。不改 `llmanspec/specs/`。

## Impact

- 依赖 `drop-index-and-context`，这样迁移手册由前序 change 先写完，本 change 只追加一节。
- 源码直接跑（不经过 `apps/cli/scripts/build-binary.ts`）的行为不变：版本仍回退到包版本，模板仍从仓库目录读，wasm 仍按开发路径找。
- 重新编译后的二进制必须使用新键。旧键不再被注入。
