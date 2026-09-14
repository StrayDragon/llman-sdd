---
depends_on:
  - port-peripheral-commands
---

# Port:review / freeze-thaw / context-index(Phase 6 后续)

## Why

承接 port-peripheral-commands 收窄后拆出的三块高级能力:五信号聚合审查(review 含 HTML 报告)、archive 冷备(freeze/thaw,7z 格式与 v1 双向兼容——核心功能保留)、pageindex 检索(index rebuild/check + context agentic loop)。

## What Changes

- `review`:五信号聚合(pending/manual、未绑定场景、staleness、锁定规则提示、validate --all 扫描)+ `--export-html` 自包含报告
- `change freeze/thaw`:7z-wasm 适配器(可选系统 7z 快路径),与 v1 冻结产物双向兼容验收
- `index rebuild/check`:tree.json 构建(零 LLM)+ sha256 新鲜度 + .rebuild.lock 语义
- `context --task/--paths`:fetch + 3 个本地工具、12 轮上限 agentic loop(OpenAI 兼容协议,环境变量命名不变)
