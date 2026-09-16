---
depends_on:
  - port-validation-engine
  - port-change-lifecycle
  - port-init-and-generators
  - port-peripheral-commands
  - port-review-freeze-context
  - port-context-index
  - refine-slop-qa-release
---

# Release:v2 发布与切换(Phase 7)

## Why

v2 功能对齐后,建立发布管线并完成本仓库的狗粮切换:从 v1(Rust llman)迁移到 v2 工具管理本仓库的 SDD 流程——切换本身就是最真实的验收。

## What Changes

- npm 包发布(包名/bin 名待定:`llman-sdd` + `llmanspec` 兼容入口候选)+ `bun build --compile` 多平台二进制 matrix 发布(冒烟 + sha256)
- release workflow(tag 触发,fetch-depth: 0 供版本注入)
- 本仓库执行 `init --update`(v2 版):skills 托管权从 v1 切到 v2,验收生成物零漂移
- 旧命令裁剪公告与 README;v1 兼容性说明(config.yaml / changes/ 布局零迁移可读)
- **切换完成后的去 v1 化清理清单**(2026-09-16 身份描述清理时有意保留的部分,随本 change 统一收口):
  - `packages/core/templates/` 模板内容的 v1 措辞(现与 v1 渲染产物字节级对齐,改动须同步刷新 golden:check 基线)
  - golden 活体门(golden:cli / golden:validate / BDD 活体对照场景)的去留裁决:v1 退场后失去对照物——保留"基线快照"模式或移除,需设计裁决
  - `project migrate` stub 的 v1 指引文案:v1 退役后改写或移除
  - 命令名/二进制名终局裁决(`llman-sdd`;`llman sdd` 退役节奏与公告)
  - 代码注释出处标注(Port of v1 xxx 等,可选)、README QA 门禁表、`docs/acceptance-v2.md` 与 `llmanspec/AGENTS.md` 验收基线条款的 v1 措辞更新
