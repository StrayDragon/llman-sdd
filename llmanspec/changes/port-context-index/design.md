# Design

## tree 构建(packages/core/src/context/tree.ts)

- `buildTreeIndex(entries, {chatModel, buildTimestamp})`:`version: 1`;docs 按 spec_id 排序
  - `reqs`:@human 规则场景 → `{req_id, title(场景名), statement(描述)}`
  - `scenarios`:@executable 场景 → `{req_id(挂链), id(场景名), given/when/then(各步文本以 \n 连接)}`
- 序列化 `llmanspec/.context/pageindex/tree.json`(llmanspec/.context/ 入 .gitignore,纯缓存)

## 新鲜度(packages/core/src/context/index.ts)

- `computeSpecHash(specsDir)`:按路径排序逐文件 `sha256(path\n content)`;hex 输出
- `checkFreshness`:读 tree.json.spec_hash 比对 → `{fresh, builtAt, specCount, chatModel}`;缺失/损坏 → stale+原因
- `.rebuild.lock`(TOML:pid/started_at/chunks_total/chunks_done/progress_pct):create-new 互斥;陈旧(>6h 或 /proc pid 不存活)先删;RAII 落盘即删

## context agentic loop(packages/core/src/context/retrieve.ts)

- env:`LLMAN_SDD_INDEX_CHAT_MODEL` 必需(缺失 → `{status:{ok:false,quality:"unavailable",qualityNote:...}}` 不发请求);`LLMAN_SDD_INDEX_CHAT_API_HOST/KEY` → `LLMAN_SDD_INDEX_OPENAI_API_HOST/KEY` 兜底
- 请求:POST `{host}/chat/completions`,system prompt 内嵌 direct/related JSON 合同(v1 提示词同构),tools 三件套,`tool_choice: auto`
- 循环:每轮把 assistant tool_calls 的结果以 tool 消息回填;12 轮上限后追加一轮无 tools 的 user 催收;解析 content JSON `{direct:[{id,reason}], related:[{id,reason}]}`
- 输出:`{status:{ok:true,quality:"ok",qualityNote:...}, direct, related}`(与 v1 status 嵌套形状一致)

## mock 测试

`Bun.serve` 起 mock `/chat/completions`:第一轮回 tool_calls(list_specs),第二轮回 content JSON——驱动完整 loop 断言分类;无需外部 LLM。

## CLI

`index rebuild|check`、`context --task/--paths/--top`;context 退出码:status.ok false → 非零。
