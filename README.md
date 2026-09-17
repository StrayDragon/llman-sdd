# llman-sdd

llman-sdd:spec 驱动开发(SDD)工作流 CLI(monorepo:`packages/core` 纯域逻辑 + `apps/cli` commander 入口),由 llman SDD 自身管理开发(见 `llmanspec/`)。

## 命令入口:`llman-sdd` / `llmanspec` / `llman sdd` 的区别

| 入口              | 状态        | 何时使用                                                                                                                                      |
| ----------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `llman-sdd <cmd>` | ✅ 主命令   | 日常使用一律用它(来自 `npm i -g @llman-sdd/cli`)                                                                                              |
| `llmanspec <cmd>` | ✅ 等价别名 | 与 `llman-sdd` 同一二进制,按习惯选用                                                                                                          |
| `llman sdd <cmd>` | 🔁 自动委托 | 旧版 Rust llman 的 muscle-memory 入口;非内置命令,经 llman 的 `llman-*` 外部发现转发给 `llman-sdd`(argv 原样转发、退出码透传),未安装时报找不到 |

> 说明:旧版 llman(v0.0.79 起)已移除内置 `sdd` 子命令,`llman sdd <args>` 未命中内置命令时
> 走 git 风格外部子命令机制(cli.feature r56)自动委托给 PATH 上的 `llman-sdd`——
> 与直接输入 `llman-sdd` 等效。

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

tag(`vX.Y.Z`)触发 `.github/workflows/release.yml`:`--compile` 五平台二进制(含 sha256)+ npm 三包(`@llman-sdd/core` + `@llman-sdd/cli` + `llmanspec` alias)。版本 SSOT 是 git tag。
