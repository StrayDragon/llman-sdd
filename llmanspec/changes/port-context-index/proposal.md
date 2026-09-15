---
depends_on:
  - port-review-freeze-context
---

# Port:context / index(pageindex 检索)

## Why

承接 port-review-freeze-context 拆出的检索能力:`index rebuild/check`(tree.json 构建——specs IR 即树,零 LLM;sha256 新鲜度;.rebuild.lock)与 `context --task/--paths`(fetch + list_specs/get_document_structure/get_spec_content 三工具、12 轮上限 agentic loop,OpenAI 兼容协议,环境变量 `LLMAN_SDD_INDEX_CHAT_MODEL` / `LLMAN_SDD_INDEX_CHAT_API_HOST/KEY` 命名不变)。

## What Changes

- `index rebuild`:从 spec IR 序列化 `llmanspec/.context/pageindex/tree.json`(TreeIndex{version, spec_hash, build_timestamp, chat_model, docs})
- `index check`:sha256 新鲜度检查;`.rebuild.lock` 陈旧判定(>6h 或 pid 不存活)
- `context --task/--paths --top`:agentic loop(12 轮上限),输出 direct/related JSON 分类
- 测试:Bun.serve 起 mock OpenAI 兼容服务器驱动 agentic loop(无外部 LLM 依赖)
