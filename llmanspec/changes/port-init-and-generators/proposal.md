---
depends_on:
  - port-config-and-parsing
---

# Port:init 与模板生成器(Phase 5)

## Why

v1 的模板渲染语义(`project/templates.rs`:Lenient 未定义变量、`unit()` 递归包含、locale 兜底)与 skills 命名空间管理(`update_skills.rs`、`config_skills.rs`、ethics 门)决定 init/生成物的逐字节正确性。

## What Changes

- TemplateEngine 适配器:nunjucks 实现(autoescape off、trim/尾换行对齐、`unit()` 走 addGlobal、嵌套上限 32)
- 模板双树(en/zh-Hans)搬运,`llman_version`/`bdd_*`/`extra_skill_*` 变量注入语义
- `init [--update]`:llmanspec 脚手架 + 根/llmanspec AGENTS.md 托管块 + skills 生成与清理(仅管 `llman-sdd-` 前缀命名空间)+ ethics 治理门
- 验收:生成物与 v1 等价 config 渲染产物 diff 为空(tests/golden)
