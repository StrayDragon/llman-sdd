# 设计：CLI 失败下一步与无草稿规格校验

遵守人类定理：`core-zero-io`（候选排序纯函数可放 CLI 层）、`cli-dual-runtime`（无 `Bun.*`）、`studio-production-hygiene`（不静默覆写 specs）。锁定设计不得自行更改。

## 无草稿与 `--specs`

| 命令 | 0 份草稿、未给 state-id | 显式 `--specs` |
| --- | --- | --- |
| `studio validate` | 自动按 `--specs` 执行，stdout 头 `source: specs`，exit 0 当无阻断诊断 | 不读草稿；`--patch` 同用 → 用法错误 exit 2 |
| `studio diff` / `prompt` | `Error:` + `Next:`，exit 1 | 不适用 |
| `studio apply` / `revise` | 需显式 id；缺草稿走 not-found | 不适用 |

Next 行（英文，首行仍以统一出口加上 `Error:`）：

| 命令 | Next |
| --- | --- |
| diff | `run \`llman-sdd studio open\` to create one, or \`llman-sdd studio validate --specs\` to check machines straight from llmanspec/specs/.` |
| prompt | `run \`llman-sdd studio open\` to create one.` |
| apply / revise | `run \`llman-sdd studio open\` to create one, then retry with a draft id.` |

`--specs` 输出：人读与 JSON 均含 `source: "specs"`；`stateId` 为空字符串。每台机器仍走 `validateMachineGraph`。只读，不写 `.llman-sdd`。

`r134` 原「0 份草稿一律域错误」对 `studio validate` 开例外，由本 change 新规则覆盖。

## not-found 候选

Helper 放 `apps/cli/src/cli-shared.ts`：

- `pickNotFoundCandidates(query, ids): string[]` — 最多 5 个；排序：前缀匹配（字典序）→ 子串匹配（非前缀，字典序）→ 编辑距离 ≤2（距离升序，并列字典序）。大小写敏感。无命中则空数组。
- `formatNotFound(kind, query, ids): string` — 有候选时 `studio state not found: nope. Available: a, b, c`；无候选不加 `Available`。

编辑距离：标准 Levenshtein，无外部依赖。同输入同输出。

### 站点清单（grep `not found` 于 `apps/cli` + 被 CLI 直接抛出的 core 入口）

**本 change 接入 helper：**

| 站点 | 现状 | 接入 |
| --- | --- | --- |
| `cli-shared.ts` `resolveChangeIdOrExit` | 透传 core `change not found: <id>` | catch 后补候选（`collectChanges` 活跃 id） |
| `commands/show.ts` `spec not found` | 单行 | 候选为当前根 spec id |
| `commands/studio.ts` `studio state not found`（prune `--id`） | 单行 | 候选为 `listStudioStates` |
| `readStudioState` 包装（diff/validate/prompt/apply/revise/comment reply） | core `StudioStateError` | CLI 包装同样式 |

**明确不改（范围外或非「命令参数 id」同形）：**

- `review.ts` capability not found
- `spec.ts` req id not found
- Hub/server JSON 404（不做 Hub）
- MCP `machine not found`（不做 MCP）
- core `resolveChangeId` 自身文案（纯域；CLI 包装）
- 多前缀命中已有 `Did you mean` 列表，保持

## 纯父分组空 Error

`program.ts` `attachPureParentUsage` 仍 `outputHelp({ error: true })` + `throw new CliError('', 2)`。`main.ts` 对空 message 的 `CliError` 只设退出码、不打印 `Error:` 行。

规格：`cli` r75 与 `studio-cli` r134 要求 Usage + 退出码 2，**未**要求空 `Error:` 行，故删除该行。

## Help 与启动行

- `--port`/`--host` 描述去掉手写 `(default: …)`，只留 commander 第三参默认值。
- `studio` 及说「state-machine」的 description 改为涵盖 machine/flow/decision。
- 启动成功一行：`Studio: http://127.0.0.1:<port>/ (workspace <name>)`（`formatLoopbackUrl` + `activeWsKey`）。只改 CLI stdout，不改 Hub/server。
