---
depends_on:
  - port-change-lifecycle
  - port-init-and-generators
---

# Port:周边命令与检索(Phase 6)

## Why

补齐 v1 的日常命令面与高级能力:`list`/`show`/`graph`(mermaid)/`review`(五信号聚合 + HTML 报告)/`context`/`index`(pageindex:零 LLM 建 tree.json + fetch agentic 检索)以及 freeze/thaw(7z 冷备,核心功能保留)。

## What Changes

- `list`/`show` 输出契约(JSON 形状对齐 v1,已删 delta 的兼容空字段可注明差异)
- `graph --format mermaid`;`review --export-html`(自包含 HTML 模板)
- `index rebuild/check`(sha256 新鲜度、.rebuild.lock 语义)+ `context --task/--paths`(fetch + 3 个本地工具、12 轮上限的 agentic loop,OpenAI 兼容协议,环境变量命名不变)
- `change freeze`/`thaw`:7z-wasm 适配器(可选系统 7z 快路径),与 v1 冻结产物双向兼容验收
- `project migrate` 引导壳(指向 v1);`spec skeleton/add-req/add-scenario/next-req-id/resolve-req` 编辑助手
