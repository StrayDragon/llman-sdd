---
depends_on:
  - port-validation-engine
  - port-change-lifecycle
  - port-init-and-generators
  - port-peripheral-commands
---

# Release:v2 发布与切换(Phase 7)

## Why

v2 功能对齐后,建立发布管线并完成本仓库的狗粮切换:从 v1(Rust llman)迁移到 v2 工具管理本仓库的 SDD 流程——切换本身就是最真实的验收。

## What Changes

- npm 包发布(包名/bin 名待定:`llman-sdd` + `llmanspec` 兼容入口候选)+ `bun build --compile` 多平台二进制 matrix 发布(冒烟 + sha256)
- release workflow(tag 触发,fetch-depth: 0 供版本注入)
- 本仓库执行 `init --update`(v2 版):skills 托管权从 v1 切到 v2,验收生成物零漂移
- 旧命令裁剪公告与 README;v1 兼容性说明(config.yaml / changes/ 布局零迁移可读)
