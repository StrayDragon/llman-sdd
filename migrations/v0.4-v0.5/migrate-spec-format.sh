#!/usr/bin/env bash
# v0.4 → v0.5 spec 格式迁移辅助:对 specs 目录内的旧标签轨 .feature 批量执行
# `spec migrate-native`(官方 Gherkin 解析 → 原生 规则:+嵌套场景)。
# 用法:bash migrate-spec-format.sh [specs-dir, 缺省 llmanspec/specs]
set -euo pipefail
target="${1:-llmanspec/specs}"
if [[ ! -d "$target" ]]; then
  echo "specs dir not found: $target" >&2
  exit 1
fi
if [[ "${CI:-}" == "" && -t 0 ]]; then
  # 交互终端:逐文件确认
  bun apps/cli/src/main.ts spec migrate-native "$target"
else
  # CI/非 TTY:全量执行
  bun apps/cli/src/main.ts spec migrate-native --yes "$target"
fi
echo "migrate done — run \`llman-sdd validate --specs --strict\` to verify"
