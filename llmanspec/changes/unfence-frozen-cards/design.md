# 设计：冻结卡归一

## 归一算子放哪

`packages/core/src/archive/frozenCard.ts` 已有 `composeFrozenCard`（写无围栏卡）与
`extractDependsOn`（读 depends_on）。归一算子与其同处一模块：它只做字符串变换，纯逻辑，
无 IO，符合 `packages/core` 的纯度要求。

```ts
/** 围栏卡 → 无围栏单文档。非围栏卡返回 null（调用方跳过）。 */
export function unfenceFrozenCard(source: string): string | null
```

判定必须严格，避免误伤内容里有 `---` 的正常卡：

| 条件 | 说明 |
| --- | --- |
| 首行恰为 `---` | 允许行尾 `\r` |
| 末行（去尾换行后）恰为 `---` | 同上 |
| 去围栏后能被单文档解析 | 用 `yaml` 的 `parseDocument` 校验，非空且无 errors |
| 文档内容只含 `title` / `depends_on` | 防止把「正文里恰好起止都是 `---` 的卡」改坏 |

不满足任一条件返回 `null`。这条边界是本设计的关键：宁可漏归一，不可误改。

## 为什么不用 `---` 计数

简单数 `---` 出现次数会把 `title: "a --- b"` 这类值误判。按行精确匹配首末行，再叠加
「解析结果为单文档且键集受控」双重保证。

## 命令落点

`project migrate` 已是迁移枢纽，已有 `strip-legacy-headers` 这个「扫描并改写文件」的先例
（[apps/cli/src/commands/project.ts](apps/cli/src/commands/project.ts)）。新动作复用同一形态：

- `--dry-run` 只报 `[unfence] <file>` 与计数
- 无 `--dry-run` 才写盘
- 收尾打印 `next:` 提示，与 `strip-legacy-headers` 一致

归档目录解析复用实例根发现（`--directory`），不新增路径参数。

## thaw 顺带归一

`runThaw` 已经遍历归档目录、删卡。归一在同一循环里做：对 `destRel` 下仍存在的围栏卡调用
`unfenceFrozenCard`，命中则写回。这里不抛错——thaw 的主职责是回置正文，卡归一失败不该
阻断回置，记一行 WARNING 即可。

## 规格措辞

现条款（[review-freeze.feature](llmanspec/specs/review-freeze.feature) r24）：

> 平铺卡 MUST 为单文档纯 YAML(无 `---` 围栏,单文档 YAML 解析器直接可解析)

这条保留，它是**写侧**合同。需要改的是 r54 在
[peripheral-commands.feature](llmanspec/specs/peripheral-commands.feature) 里那句
「`---` 围栏卡(存量格式,不迁移)」——改为「读取 MUST 兼容围栏卡；工具 MUST 提供归一入口；
`freeze`/`thaw` 写出的一律无围栏」。读取兼容不删，只是不再宣称「永久不迁移」。

## 门禁收敛

归一完成后本仓库 `.pre-commit-config.yaml` 的两条 `check-yaml` 可以收回一条严格条目。
`tests/bdd/assert/quality-gates.ts` 里我为双条目加的断言同步改成单条目断言——否则归一
后反而会被自己的断言拦住。
