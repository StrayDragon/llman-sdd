---
depends_on:
- port-review-freeze-context
branch: sdd/port-context-index
base_sha: 50c42510fc1406d8292df96a64c1c8c7e560de4a
base_branch: main
---

# Port:context / index(pageindex 检索)

## Why

承接 port-review-freeze-context 拆出的检索能力:`index rebuild/check`(tree.json 构建——specs IR 即树,零 LLM;sha256 新鲜度;.rebuild.lock)与 `context --task/--paths`(fetch + 三本地工具、12 轮上限 agentic loop,OpenAI 兼容协议)。这是 v1 全功能面在 v2 的最后一块。

## What Changes

- `index rebuild`:从 spec IR 序列化 `llmanspec/.context/pageindex/tree.json`——TreeIndex{version:1, spec_hash, build_timestamp, chat_model(构建时记录,仅信息), docs[{spec_id,purpose,reqs[{req_id,title,statement}],scenarios[{req_id,id,given,when,then}}]};构建零 LLM
- `index check`:sha256(排序后全部 spec 内容)对比 tree.json.spec_hash → fresh/stale 输出
- `.rebuild.lock`(TOML:pid/started_at/chunks_total/chunks_done/progress_pct):create-new 互斥,陈旧判定(>6h 或 pid 不存活)先清理
- `context --task <TASK> [--paths] [--top N]`:agentic loop——OpenAI 兼容 `/chat/completions` + tool calling,三工具 `list_specs`/`get_document_structure(spec_id)`/`get_spec_content(spec_id, req_ids)`,12 轮上限后强制一轮无工具收敛;env 契约不变(`LLMAN_SDD_INDEX_CHAT_MODEL` 必需,`LLMAN_SDD_INDEX_CHAT_API_HOST/KEY` → `LLMAN_SDD_INDEX_OPENAI_*` 兜底);model 未设 → `quality: unavailable`
- 测试:Bun.serve mock OpenAI 兼容服务器驱动完整 agentic loop(无外部 LLM 依赖)
