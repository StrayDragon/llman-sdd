---
name: "llman-sdd-archive"
description: "verify 通过后使用。把已完成 change 合并回基准分支并归档。不用于仍在实施的变更。"
metadata:
  version: "0.1.0"
---

# LLMAN SDD 归档

将 verify 全绿的绑定 change 收口回基准分支并归档至 `llmanspec/changes/archive/`。

> 位于分支生命周期最后一站。specs 膨胀时可跑 `llman-sdd-specs-compact`。

## 硬约束

- **前置门禁**：必须先 verify 全绿、已绑定分支、工作区干净，且每个 id 均通过 `llman-sdd review`（无 CRITICAL）与 `llman-sdd validate <id> --strict`。
- **单命令本地收口**：`llman-sdd change archive <id>` 自动完成预合并门禁、合并（默认 squash）、目录改名与自动提交 `archive(sdd): <id>`（`--no-commit` 跳过自动提交）。不得默认 `git push` 或建 PR。
- **批量连续执行**：批量归档一口气跑完，任一失败即停并报告剩余 ID；不得中途问“是否继续”。

## 步骤

1. **确认目标与干净树**：检查 `git status --porcelain`，明确归档 ID 列表（可查 `llman-sdd list --json`）；破坏性合约变更须确认 `migrations/v<from>-v<to>/` 已就绪。
2. **逐个校验并归档**：
   - 运行 `llman-sdd review`（无旗标）与 `llman-sdd validate <id> --strict`；任一失败即停。
   - 可先 `--dry-run` 预览，再运行 `llman-sdd change archive <id>`。目标分支被其他 worktree 持有时自动在该 worktree 原地收口。
3. **收尾复核**：全部归档后运行 `llman-sdd validate --all --strict`；squash 合并后可按需 `git branch -D <feature>`。归档目录过多时可用 `llman-sdd freeze` / `llman-sdd thaw` 维护冷备索引卡。

> 命令细节用 `llman-sdd <cmd> --help` 查看；命令参考以 CLI 为准，skill 不内嵌命令表。
> 文中“规约”= 本项目 `llmanspec/specs/` 下的 `.feature` 文件；用 `llman-sdd list --specs` / `llman-sdd show <capability>` 查全文。

校验修复（单轨 feature-as-spec）：

1）缺 `# purpose:` 头注释：每个 capability `.feature` 必须含非空 `# purpose:`；`功能:` 标题必须等于 discover 分配后的 spec id（`llman-sdd list --specs` 查看 id）。
```
# language: zh-CN
# purpose: 一句话概述

功能: <spec-id>
```

2）原生分层格式（`rule must carry an @req:<req_id> tag on the rule header`）：
- 规范样式只有一种：`@req:<id>` 挂在 `规则:` 块头标签,块内嵌套 `场景:`(假如/当/那么)是可执行示例——默认首选。
- 仅当需求无法程序化表达或暂不转写时才保留无嵌套场景的 `规则:`(裸规则):描述自由文本,不强制情态词;validate 以聚合计数提示,review `pending` 信号计量,specs-compact 负责压降。
- 历史标签 `@executable`/`@rule`/`@human`/`@manual` 不再使用、解析惰性;旧文件不再提供迁移命令,历史标签保持惰性。
- 不在任何 `规则:` 内的顶层 `场景:` 是功能级示例:无规则句柄、不告警、不参与规则统计(Gherkin 原生语义)。

分支护栏：
- 先 `change start` 绑定分支，再在绑定的非默认分支编辑 `.feature` 并 commit（提交 specs）。
- 锁定规则（报告制）：改/删既有 `规则:` 块只出 WARNING，不阻断 validate / finalize / `change diff`；报告按 `@req:<id>` 指明被改规则。控制点：git 分支对比 + `llman-sdd review` / `change diff`。旧锁定确认元数据（frontmatter `rules_touched` / `agent_acked`、`@agent` tag、`--yes` 确认语义）已全部删除，无别名无兼容层。
- `stage=full` 且 specs-landed 门通过（specsLanded ∨ `needs_specs_change: false`）即可进 apply；verify/finalize 须 `readyToImplement=true`（完成信号）。收口优先 `change archive`。

## Context
- 先查状态再动手：change/spec 状态以 `llman-sdd show/list/validate` 输出为准；读 spec 全文前先 `llman-sdd list --specs`，再直读 `.feature`。

## Goal
- 达成一个可验证结果；报告附结果路径与校验状态。

## Constraints
- 遵守正文硬约束与 `llmanspec/theorems/` 只读人类定理（不得由 Agent 擅自修改）。先判断规模选路径：合约变更走完整 SDD，实现层走 quick；不确定选完整 SDD。改动最小；已知校验错误不得强行继续。

## Workflow
- 每步以 `llman-sdd` 命令结果为事实来源；改动工件后必跑 `llman-sdd validate`；命令细节见 `llman-sdd <cmd> --help`。

## Decision Policy
- 高影响歧义先澄清再继续；事实自己查证，只有决策问用户。

## Output Contract
- 先给人读摘要（结论 / 风险 / 待决策），机器细节随后。

## Ethics Governance
- `ethics.risk_level`：low——只读写本仓库与 `llmanspec/`，无外发动作；正文另有声明时按正文执行。
- `ethics.prohibited_actions`：违反正文硬约束的动作；用户未明确要求时，不得 push、发 PR 或向外部上传。
- `ethics.required_evidence`：结论必须给出命令输出或文件路径；门禁状态以 `llman-sdd validate` 输出为准。
- `ethics.refusal_contract`：门禁 CRITICAL 未清零时，不得进入下一阶段；自修复达到上限时，报告 blocker。
- `ethics.escalation_policy`：改动 SDD 合约、模板，或执行不可逆动作前，必须先取得用户确认。
