---
depends_on:
  - add-studio-onboarding-and-ergonomics
  - add-studio-search-recall
  - add-studio-agent-skills
title: "[Post-Studio] 建立人类定理（Human Theorems）只读不变量层与轻量精简 Skill 演进"
branch: sdd/add-human-theorems-and-lean-skills
base_branch: main
base_sha: 1f0ea3c16549008c154bdeee4a0b792fcb8c9d29
---

# 建立人类定理（Human Theorems）只读不变量层与轻量精简 Skill 演进

## Why

随着编码模型能力持续增强，多轮协作的真正风险不再是“模型不会写步骤”，而是每一轮修改都让既有测试全绿，但数据归属、接口兼容性、模块职责或资源限制却在细微偏差累积下逐渐偏离最初意图。

与此同时，过度规定微观操作步骤的 Skill 会让工作流日益沉重。`llman-sdd` 的核心目标是**增强开发者体验（DX）**：一方面通过 Studio 提供随时可交互的“活产品说明”，另一方面让规则体系顺应强模型趋势——**少规定每一步怎么做，但极其清晰地声明什么必须成立、什么不得被 Agent 擅自改变**。能自动检查的约束进一步下沉到类型、测试、脚本或合并门禁，不把 AI 对照 Spec 自检当作不会出错的保证。

## What Changes

- **「人类定理（Human Theorems）」只读不变量层**（灵感源自 Lean `theorem`，定位为轻量工程文档 + 可选自动化门禁校验）：
  - 与正常随需求演进的 `llmanspec/specs/` 明确分层：`specs/` 允许人类与 Agent 随需求变动共同迭代；「人类定理」则沉淀迭代过程中发现的少量、高杠杆硬不变量（数据归属、接口契约红线、模块边界、安全与资源上限），条目少而精、人类可高效检索召回。
  - **可选 OS 级强权限写保护**：提供可选机制将定理文件锁定为只读或交由 `root` 属主托管（人类通过 `sudo` 或显式解锁命令修改，Agent 在普通用户态物理不可篡改），从系统权限层杜绝越界覆写。
  - **可执行约束下沉**：支持每条人类定理可选关联类型检查、单测、门禁脚本或合并检查，把关键不变量落成确定性验证而非纯自然语言提示。
- **Agent 全域注入与 Studio 只读预览 / 检索体验**：
  - 在 `llmanspec/AGENTS.md` 预设与 `llman-sdd-*` 相关 skills 中显式声明人类定理目录/文件的只读遵循约束，确保每次 Agent 会话都能稳定加载并遵守。
  - 在 Studio 中提供人类定理的只读高亮预览、快速检索召回与关联定位（配合 Studio 的交互式产品说明体验，提供舒适的调试与人类修订入口）。
- **`llman-sdd-*` Skills 轻量化精简演进**：
  - 在 Studio 体系完备后，对内置 `llman-sdd-*` skills 做一轮系统瘦身：压缩对强模型多余的微观步骤规定，将指令重心收敛到「人类定理（不可变边界）+ 规格事实来源 + 可执行门禁」三件事上。

## Capabilities

- `spec-parsing` / `validation` / `init-generators` / `studio-web`：新增人类定理声明格式、可选权限锁辅助命令、模板/AGENTS.md 注入、Studio 只读预览检索及精简化 Skill 模板。

## Impact

- 明确延后至 Studio 主线与检索/易用性完善之后推进（依赖 `add-studio-onboarding-and-ergonomics`、`add-studio-search-recall`、`add-studio-agent-skills`）。
- 零破坏现有 `llmanspec/specs/` 行为合约，作为可选增厚层渐进启用。

## Open Questions

- 人类定理的推荐物理落点：独立 `llmanspec/theorems/`（按主题拆极少数短文件，便于粒度权限锁）还是单文件 `llmanspec/THEOREMS.md`？
- OS 级只读/属主锁在 Linux/macOS/WSL 下的最佳 DX：`llman-sdd theorem lock / unlock / edit` 如何与 `sudo`、Git checkout/merge 顺滑共存而不阻塞日常切分支？
- Skills 瘦身的评估基准：是否基于 `eval/` 对比精简前后 Agent 在强模型下的门禁一次通过率与 Token 消耗？
