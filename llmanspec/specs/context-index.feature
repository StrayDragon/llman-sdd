# language: zh-CN
# capability: context-index
# purpose: 定义 pageindex 索引构建/新鲜度合同与 context agentic 检索的 env、工具、循环上限、输出去重与汇总/降级契约。
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

  @req:r28 @human
  场景: 检索结果去重
    - `context --task` 输出 MUST 去重:同一 spec_id 同时出现在 direct 与 related 时 MUST 仅保留 direct 档条目并从 related 移除;同一档内重复 spec_id MUST 仅保留首个条目;summary 的 tierDirect/tierRelated/unrelatedCount MUST 在去重后计算。

  @req:r28 @executable
  场景: 跨档与同档重复条目去重
    假如 注入 mock 模型其最终回答 direct 含 spec-A 与 spec-B 且 related 含 spec-B 与 spec-C
    当 运行 context --task
    那么 direct 仅含 spec-A 与 spec-B 且 related 仅含 spec-C
    而且 summary 的 tierDirect 为 2 且 tierRelated 为 1

  @req:r29 @human
  场景: 输出汇总与降级契约
    - `context --task` 成功输出 MUST 含 summary{totalSpecs,tierDirect,tierRelated,unrelatedCount,toolCalls,staleWarnings,readRecommended,paths} 且 readRecommended MUST 为 direct 档 id 序列;quality 值域 MUST 为 agentic 与 unavailable;工具轮耗尽 MUST 降级为 ok 且 quality agentic、qualityNote 注明截断、direct/related 为空;检索失败(网络或 HTTP 非 2xx)MUST 输出 quality unavailable、errorKind api_error 与 summary{totalSpecs:0,error:true};进度与调试信息 MUST 走 stderr,结果 JSON MUST 走 stdout。

  @req:r29 @executable
  场景: 工具轮耗尽降级
    假如 注入 mock 模型每轮都请求工具且从不给出最终回答
    当 运行 context --task 直至轮次耗尽
    那么 quality 为 agentic 且 qualityNote 含截断注记
    而且 direct 与 related 均为空

  @req:r29 @executable
  场景: 检索失败错误输出
    假如 注入 mock 模型端点返回 HTTP 500
    当 运行 context --task
    那么 quality 为 unavailable 且 errorKind 为 api_error
    而且 summary 为 totalSpecs 0 且 error true

  @req:r57 @human
  场景: context/index backend 旗标
    - `context` 与 `index rebuild` MUST 接受 `--backend pageindex`;`--backend rag` MUST 报错并提示该后端已移除;取值优先级 MUST 为 CLI 旗标 > env `LLMAN_SDD_INDEX_BACKEND` > 缺省 pageindex。

  @req:r57 @executable
  场景: backend 旗标口径
    当 运行 index rebuild --backend rag
    那么 报错并提示迁移到 pageindex

  @req:r62 @human
  场景: context 检索前索引懒刷新
    - `context` 在索引 missing/corrupted/stale 时 MUST 自动执行一次零 LLM 的 index rebuild 后再检索,MUST NOT 仅因 missing/stale 返回 quality=unavailable 或 index_stale/index_missing 类错误;rebuild 失败 MUST 输出 JSON error(ok=false, errorKind=index_rebuild_failed, 附手工重建指引)且退出码为 0;`index check`/`index rebuild` 的既有合同不变。

  @req:r62 @executable
  场景: 无索引时检索自愈
    假如 一个含 specs 但无 .context 索引的临时仓库
    当 运行 context 查询
    那么 索引被自动重建且不因 missing 返回 unavailable
