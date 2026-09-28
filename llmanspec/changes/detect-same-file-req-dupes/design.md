# Design

## 判重模型：出现（occurrence）而非文件

```ts
export interface RegistryOccurrence {
  fileName: string;  // 携带该 reqId 的规则所在文件
  ruleIndex: number; // 该规则在 doc.rules 中的序号（0 基）
  title: string;     // `规则:` 标题（人读定位）
}
export interface RegistryDuplicate {
  reqId: string;
  files: string[];               // 去重排序（展示用，保留既有形状）
  occurrences: RegistryOccurrence[]; // 全部出现，按扫描序
}
// byId: Map<string, RegistryOccurrence[]>；duplicates 当且仅当 occurrences.length > 1
```

- `RuleIR` 无行号，occurrence 定位用「文件 + 规则序号 + 标题」——validate 报错消息与 dedupe 报告够用，且不给 parser 加行号追踪（最小改动）。
- `byId` 值类型从 `string[]` 变 `RegistryOccurrence[]`：仓内消费者已审计（`nextReqId` 仅用 keys、`buildDuplicatesFor` 仅用 duplicates、review/specHelpers 不取值）。

## dedupe 语义：首现保留，其余重取号

出现按（文件名排序、文件内规则序号）全序排列；首个出现保留，第 2+ 出现逐个重取空闲短 id。该语义：

- 跨文件场景与现行为一致（keep 首文件、remap 其余文件）；
- 同文件场景即下游 crystalith 的手工修复策略（首现保留 + 后续 `spec next-req-id` 重取号）；
- 同文件 + 跨文件混合时按同一全序处理，无特例。

## planDedupe 定点替换（修前缀误伤）

`DedupePlanItem` 新增 `occurrenceOrdinal`（该 id 在 `remapFile` 文本中的第几次出现，1 基）。apply 循环改为：

1. 按 tag 词边界匹配：`@req:rN` 后必须是非 `\d`（行内多 tag 以空格分隔、行尾结束），杜绝 `@req:r1` 命中 `@req:r10` 前缀；
2. 只替换第 `occurrenceOrdinal` 次命中，其余出现不动（同文件首现保留由此成立）。

替换在行内做（扫描行、正则计数命中、目标次序行内替换一次），保持纯文本变换、不经过 parser 往返。

## CLI 呈现

- `dedupe-req-ids` 输出行维持 `{cap}: {from} → {to}`（同文件碰撞产生同 cap 多行，自解释）；dry-run 前缀不变。
- validate 的 ERROR 消息沿用现有 duplicate 文案源，files/occurrences 由 `buildDuplicatesFor` 内部消化，CLI 不另拼。

## 不做的事

- 不给 parser 加行号（occurrence 定位强度足够，避免触碰解析层合约）。
- 不迁移/重排仓内自身 specs——本仓 specs 扫描为零碰撞，无存量数据可修。
- 不改 `resolveReq` 的首匹配语义（碰撞修复后歧义自然消失）。
