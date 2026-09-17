# llman-sdd

llman-sdd:spec 驱动开发(SDD)工作流 CLI(monorepo:`packages/core` 纯域逻辑 + `apps/cli` commander 入口),由 llman SDD 自身管理开发(见 `llmanspec/`)。

## 常用命令

```bash
just qa            # 静态门禁 + 全部测试(等价 CI)
just golden        # skills 渲染基线门(版本号归一化)
just smoke-context # 真实 LLM 检索冒烟(未配置模型时干净跳过)
bun run build      # CLI 单二进制(apps/cli/dist/)
```

## QA 门禁一览

| 门禁         | 命令                   | 说明                                                   |
| ------------ | ---------------------- | ------------------------------------------------------ |
| 静态         | `just check`           | tsc + oxlint + oxfmt                                   |
| 测试         | `bun test tests/`      | unit + BDD(@executable 驱动真实核心/CLI) + integration |
| golden:check | `bun run golden:check` | skills 渲染 vs v2 自有快照基线(版本号归一化)           |

行为合约的 SSOT 是 `llmanspec/specs/*.feature`:`@human` 规则定义 MUST 条款,`@executable` 场景经 `bun test tests/bdd` 驱动真实实现作为验收。

## Capture 契约(QA 采集)

- **stdout = 结果 JSON**,**stderr = 进度/调试信息**——所有采集 harness(BDD 步骤)按此归一化,新增命令输出必须遵守(r29)。
- `context` 输出:`status{ok,quality,qualityNote}` + `direct/related` 分类(元素含 `id`/`reason`,direct∩related 去重) + `summary` 汇总;失败时 `quality: unavailable` 且 `summary` 收缩为 `{totalSpecs:0,error:true}`(r28/r29)。

## context 检索环境变量

| 变量                                     | 必填 | 说明                                                                      |
| ---------------------------------------- | ---- | ------------------------------------------------------------------------- |
| `LLMAN_SDD_INDEX_CHAT_MODEL`             | 是   | 支持 tool calling 的对话模型;未设时 `context` 输出 unavailable 且不发请求 |
| `LLMAN_SDD_INDEX_CHAT_API_HOST` / `_KEY` | 否   | 缺省回退 `LLMAN_SDD_INDEX_OPENAI_API_HOST/KEY`,再回退官方端点             |

真实链路冒烟:`just smoke-context`(对当前仓库跑一次 `context --task`,校验 r27-r29 输出契约与去重不变量)。

## 发布

tag(`vX.Y.Z`)触发 `.github/workflows/release.yml`:`--compile` 五平台二进制(含 sha256)+ npm 双包(`@llman-sdd/core` + `llman-sdd`)。版本 SSOT 是 git tag。
