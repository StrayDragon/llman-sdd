---
depends_on: []
title: 规格文件补齐行尾换行
needs_specs_change: false
branch: sdd/normalize-specs-trailing-newline
base_branch: main
base_sha: 43b98c9e2d3134648b0b161364604e55cc00f86d
---

## Why

7 个 `llmanspec/specs/*.feature` 末尾缺行尾换行。根因是 `spec add-scenario` 插入落在文件尾时
`lines.join('\n')` 吃掉原尾换行(已在 58470e0 修复并补单测)。存量文件随之补齐,让
`prek run --all-files` 的 end-of-file-fixer 不再反复改写同一批文件。

## What Changes

- 8 个规格文件补末尾换行(`change-lifecycle`、`config-schema`、`peripheral-commands`、
  `review-freeze`、`spec-authoring`、`spec-parsing`、`validation`)。
- 仅空白差异,不改任何需求语义或场景步骤。
