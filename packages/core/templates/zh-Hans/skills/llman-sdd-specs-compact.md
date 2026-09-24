---
name: "llman-sdd-specs-compact"
description: "压缩去重 specs：合并冗余 requirement/scenario，规范行为不变。仅用户明确要求时手动运行。"
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Specs Compact

在不改变规范行为的前提下压缩 specs。维护工具，不属于日常 pipeline，通常在归档积累较多后执行。

## Context
- specs 随变更积累膨胀，出现重复 requirement/scenario；压缩必须可验证、可回归。
- archive 历史过大时会干扰压缩评审与定位。

## Goal
- 合并冗余 requirement/scenario，形成更紧凑可维护的规范结构。

## Constraints
- 未经明确替代不得删除规范性行为；尽量保持 requirement 标题稳定；每个保留 requirement 至少一个有效 scenario。
- **改 `llmanspec/specs/**` 须走 change**：先绑定分支（`change start` / `attach`），在绑定分支上编辑提交；**禁止**在默认分支直接压缩改写。

## Workflow
1. 盘点 specs（`llman-sdd list --specs`）。
2. 归档历史较大时先 freeze：预览 `llman-sdd archive freeze --dry-run`；执行 `llman-sdd archive freeze --before <YYYY-MM-DD> --keep-recent <N>`。
3. 识别跨 capability 重叠（跨 specs 重复 req id：`llman-sdd project dedupe-req-ids --dry-run` 报告重映射计划）。
4. 产出压缩计划（canonical requirements + keep/merge/remove 决策 + 迁移说明）。
5. 执行并验证（`llman-sdd validate --specs --strict`）。

## Decision Policy
- 语义等价优先合并；仅引用关系清晰时提取共享文本；archive 噪声大时先 freeze 再压缩。
- 若压缩会改变外部行为，先暂停并询问用户。

## Output Contract
- 按 capability 分组的压缩方案：keep/merge/remove 决策及理由 + 验证命令与预期结果。

{{ unit("skills/cli-footer") }}

{{ unit("skills/validation-hints") }}

{{ unit("skills/ethics-governance") }}
