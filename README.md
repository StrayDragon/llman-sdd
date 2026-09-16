# llman-sdd

llman-sdd:spec 驱动开发(SDD)工作流 CLI(monorepo:`packages/core` 纯域逻辑 + `apps/cli` commander 入口),由 llman SDD 自身管理开发(见 `llmanspec/`)。

## 常用命令

```bash
just qa            # 静态门禁 + 全部测试(等价 CI)
just golden        # golden 四门统一入口(见下表)
just smoke-context # 真实 LLM 检索冒烟(未配置模型时干净跳过)
bun run build      # CLI 单二进制(apps/cli/dist/)
```

## QA 门禁一览

| 门禁            | 命令                                               | 依赖 v1 `llman` | 说明                                                            |
| --------------- | -------------------------------------------------- | --------------- | --------------------------------------------------------------- |
| 静态            | `just check`                                       | 否              | tsc + oxlint + oxfmt                                            |
| 测试            | `bun test tests/`                                  | 否*             | unit + BDD + integration;*无 v1 时自动跳过"活体 v1↔v2 对照"场景 |
| golden:check    | `bun run golden:check`                             | 否              | skills 渲染 vs 已提交基线(版本号归一化)                         |
| golden:validate | `bun run golden:validate`                          | 是              | validate 判定结果 v1↔v2 对照(种子缺陷仓库)                      |
| golden:cli      | `bun run golden:cli`                               | 是              | 12 条命令活体对照(文本归一化为排序集)                           |
| 冷备兼容        | `bun test tests/integration/freeze-compat.test.ts` | 否*             | v1 冻结 → v2 解冻(7z-wasm)                                      |

v1 依赖门( golden:validate / golden:cli / 部分 BDD 场景)默认不进 CI——需要 `cargo install llman@0.0.78`(分钟级 Rust 全量编译,且给 TS 仓库引入 cargo 工具链);若未来需要 CI 活体对照,复评缓存方案后再启用。

## Capture 契约(QA 采集)

- **stdout = 结果 JSON**,**stderr = 进度/调试信息**——所有采集 harness(golden 门、BDD 步骤)按此归一化,新增命令输出必须遵守(r29)。
- `context` 输出:`status{ok,quality,qualityNote}` + `direct/related` 分类(元素含 `id`/`reason`,direct∩related 去重) + `summary` 汇总;失败时 `quality: unavailable` 且 `summary` 收缩为 `{totalSpecs:0,error:true}`(r28/r29)。

## context 检索环境变量

| 变量                                     | 必填 | 说明                                                                      |
| ---------------------------------------- | ---- | ------------------------------------------------------------------------- |
| `LLMAN_SDD_INDEX_CHAT_MODEL`             | 是   | 支持 tool calling 的对话模型;未设时 `context` 输出 unavailable 且不发请求 |
| `LLMAN_SDD_INDEX_CHAT_API_HOST` / `_KEY` | 否   | 缺省回退 `LLMAN_SDD_INDEX_OPENAI_API_HOST/KEY`,再回退官方端点             |

真实链路冒烟:`just smoke-context`(对当前仓库跑一次 `context --task`,校验 r27-r29 输出契约与去重不变量)。

## 已知差异(相对 v1,裁决记录)

- `Agent pid` 存活检测的噪声细节不移植(环境相关输出,不属于合约)。
- v2 `context` 成功时 `qualityNote: "pageindex"`;v1 为 `null`。语义等价,不进对照归一化。
