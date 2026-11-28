---
depends_on:
  - add-spec-flow-and-nested-machines
  - improve-cli-failure-next-steps
  - add-studio-nest-context-deeplink
  - add-studio-agent-skills
title: 规则墙转图技能与 Studio 技能语法对齐
branch: sdd/add-specs-structure-skill
base_branch: main
base_sha: 1f1fb54273f0fef3be6497552fa820739aca31e7
---

# 规则墙转图技能与 Studio 技能语法对齐

## Why

P1 已能用 `@transitions` / `@flow` / `@states` 声明图方言，P2 已能对规格直接 `studio validate --specs`，P4 深链已带 nest/focus。现有 `llman-sdd-studio-onboard` 仍把流程图写成「步骤流转表」，且未把四类选型收成可触发的独立技能。Agent 要把大段规则墙迁成 Studio 可见行为逻辑时，缺少统一流程与判定表。

## What Changes

- 新增 `llman-sdd-specs-structure` 技能模板（≤ 60 行）：触发句为首句「规格大段规则文字需要在 Studio 看见行为逻辑时使用」；流程只用已合入命令（`studio validate --specs`、`spec transitions`、`validate --specs --strict`、`studio open`），不含不存在的 `studio coverage`。
- 修订 `llman-sdd-studio-onboard`：四类图谱示例改为 P1 真实语法；第 3 步改为 `studio validate --specs`。
- 修订 `llman-sdd-studio-collab`：深链说明补 nest/focus（P4 已合入）。
- 调研 `research/agent-surfaces.md`：Claude Code / Cursor / Codex / Antigravity 的 skills 目录与 MCP 落点，每条断言附官方 URL 与访问日期；末尾建议是否给 init 加 `--agent`（不实现）。

## Capabilities

- `init-generators`：新增 specs-structure 技能模板与基线同步规则；onboard/collab 模板随渲染刷新。

## Impact

- 只改 `packages/core/templates/`、skills 注册、golden / `.agents/skills` 生成物与 init-generators 规格。
- 不改 init 写入目标、不新增 init 旗标、不改 MCP / CLI 命令面、不改 studio-web。
