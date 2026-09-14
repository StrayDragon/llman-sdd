---
depends_on:
  - port-change-lifecycle
  - port-init-and-generators
---

# Port:周边命令面(list/show/graph/spec 助手)(Phase 6)

## Why

补齐 v1 的日常确定性命令面:`list`(人读/JSON)、`show`(change JSON / spec 文本)、`graph --format mermaid`、`spec skeleton/next-req-id` 编辑助手、`project migrate` 引导壳。验收采用**活体 golden**:同一仓库上 v1 与 v2 实时输出经归一化(时间戳/相对时间)后必须一致。

原草稿中的 `review`、`context/index`(LLM agentic)、`change freeze/thaw`(7z)拆分到后续独立 change `port-review-freeze-context`,避免单 change 范围过大。

## What Changes

- `list [--specs] [--json]`:JSON 字段名与 v1 一致(name/path/stage/completedTasks/totalTasks/lastModified/idleDays/status);人读输出列格式对齐
- `show <change> --output json`(字段集与 gateChecks 结构对齐 v1)、`show <spec>`(specs 原文直出)
- `graph --format mermaid`:节点名 `-`→`_` sanitize、archived 节点 `✓ done` 标注与 archived class、`depends on` 边、classDef 行
- `spec skeleton <cap>`(单轨骨架,locale 按 config)、`spec next-req-id`(全局注册表)
- `project migrate`:引导壳(指向 v1 Rust llman ≤ 0.0.x),不移植迁移实现(范围裁决见 llmanspec/AGENTS.md)

## Capabilities

- peripheral-commands
