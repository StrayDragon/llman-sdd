# language: zh-CN
# capability: context-index
# purpose: 定义 pageindex 索引构建/新鲜度合同与 context agentic 检索的 env、工具与循环上限契约。
# scope: packages/core/src/context/, apps/cli/src/, llmanspec/.context/

功能: context-index

  @req:r26 @human
  场景: 索引构建与新鲜度
    - `index rebuild` MUST 零 LLM 地从 spec IR 构建 `llmanspec/.context/pageindex/tree.json`:顶层 MUST 为 version(=1)/spec_hash/build_timestamp/chat_model/docs,docs 按 spec_id 排序,元素 MUST 含 spec_id/purpose/reqs[{req_id,title,statement}]/scenarios[{req_id,id,given,when,then}];`index check` MUST 以 sha256(排序后全部 spec 内容)对比 spec_hash 报告 fresh 或 stale;`.rebuild.lock` MUST 以 create-new 互斥并清理陈旧锁(>6h 或 pid 不存活)。

  @req:r26 @executable
  场景: rebuild 与新鲜度闭环
    假如 一个含 specs 的临时仓库
    当 rebuild 后立即 check
    那么 报告 fresh
    当 修改任一 spec 后再 check
    那么 报告 stale

  @req:r27 @human
  场景: context agentic 检索合同
    - `context --task` MUST 使用 OpenAI 兼容 `/chat/completions`(tool calling),工具 MUST 为 list_specs / get_document_structure(spec_id) / get_spec_content(spec_id, req_ids) 三件套,循环 MUST 以 12 轮为上限并在达到上限后强制一轮无工具收敛;env MUST 为 `LLMAN_SDD_INDEX_CHAT_MODEL`(必需)、`LLMAN_SDD_INDEX_CHAT_API_HOST/KEY` 并回退 `LLMAN_SDD_INDEX_OPENAI_*`;model 未设时 MUST 输出 `quality: unavailable` 且不发起请求;输出 MUST 为 status{ok,quality,qualityNote} 嵌套 JSON 加 direct/related 分类(元素含 id 与 reason)。

  @req:r27 @executable
  场景: model 未设时不可用
    假如 环境未设置 LLMAN_SDD_INDEX_CHAT_MODEL
    当 运行 context --task
    那么 quality 为 unavailable
    而且 不发起任何网络请求
