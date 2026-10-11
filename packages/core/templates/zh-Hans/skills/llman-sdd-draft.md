---
name: "llman-sdd-draft"
description: "把 change 想法记成草案（仅 proposal.md，不问 id）。随手记 idea/未来需求；落实时走 propose。"
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD 草案（Draft）

把 change 想法记成**草案**（仅 `proposal.md` skeleton）——“先记下来”的轻量入口：不判断规模、不写 tasks、不改 specs、不 attach。落实时用 `llman-sdd-propose` 正式化。

## Pipeline 位置

```mermaid
flowchart LR
    draft["★ llman-sdd-draft"] -.->|"正式化"| propose["llman-sdd-propose"]
    propose --> apply["llman-sdd-apply"] --> verify["llman-sdd-verify"] --> archive["llman-sdd-archive"]

    style draft fill:#fff3cd,stroke:#ffc107,stroke-width:3px
```

> 📍 草案阶段 → 下一步：完善 `proposal.md`，然后 `llman-sdd-propose` 正式化。

## 硬约束

- **不得 询问 change id**：由 `change new --from` 从描述推导并告知用户。
- **不得 创建 tasks/design/specs/attach**：只建 `proposal.md` 草案；完整规划归 `llman-sdd-propose`。
- **不得 判断变更规模**：那是 propose 的职责。用户想开始实现 → 宜转 `llman-sdd-propose`。
- **适用边界**：描述明显涉及行为合约（需求语义）变更或多文件改动时，宜转 `llman-sdd-propose`——但仍先建草案以免想法丢失。
- **frontmatter 有固定 schema**：`proposal.md` 只接受 `llmanspec/AGENTS.md`“Change Proposal Frontmatter SSOT”的合法字段（`depends_on`、`title`、`blocks`、`branch`、`base_sha`、`needs_specs_change` 等）；`title` 必须为非空的一句话概念式标题，不得复读 change id——缺失或为空串时 `llman-sdd validate` 报 ERROR；`status`/`priority`/`author` 等集外字段同样报 ERROR。生命周期阶段是推断量（用 `llman-sdd show`/`list` 查），不得写进 frontmatter。正文不得复读 frontmatter 字段（不得 `## Status` 段）；H1 宜保留人类可读标题（freeze 取 title 时 frontmatter 优先、H1 回退），不复读 change id。

## 步骤

### 0) Preflight
- 读 `llmanspec/config.yaml`；`llmanspec/` 不存在则提示先跑 `llman-sdd init`，然后 STOP。

### 1) 捕获描述
- 直接采用用户描述（如“draft: 加一个导出 json 的命令”“记一下: sdd change 宜支持 worktree”）。**不得 询问 change id。**

### 2) 创建草案
```bash
llman-sdd change new --from "<用户描述>"
```
- CLI 生成合法 kebab-case id，在 `llmanspec/changes/<id>/` 建 `proposal.md`（含 `## Why` / `## What Changes` TODO 段），并打印 id 与路径。
- id 冲突时 CLI 非零退出；宜改写描述或 `--force` 覆盖（草案罕见）。

### 3) 告知并交接
- **必须 告知生成的 id**（“已创建草案 change `<id>`，路径 `llmanspec/changes/<id>/proposal.md`”）。
- 下一步宜完善 `proposal.md`（Why / What Changes / Capabilities / Impact）；落实时跑 `llman-sdd-propose`。

{{ unit("skills/cli-footer") }}

{{ unit("skills/ethics-governance") }}
