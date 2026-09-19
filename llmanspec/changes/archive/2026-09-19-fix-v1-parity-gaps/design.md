# Design: fix-v1-parity-gaps

## 前缀解析语义（v1 r112 移植）

优先级链（单一事实来源，禁止各命令分叉）：

1. exact match（`viaPrefix: false`）
2. unique prefix match（`viaPrefix: true`）
3. multiple prefix matches → 报错并列出全部候选（`  - <id>` 逐行），退出码非零
4. no match → 沿用现有 `change not found: <input>`

- 大小写敏感（确定性）；候选 = 活跃 changes（`llmanspec/changes/**/proposal.md`，
  复用 `collectChanges` 的 id 枚举，尊重 `--max-scan-depth`）。
- 唯一前缀命中且人读输出（非 `--json`）时，向 stderr 打
  `'<input>' -> '<resolved>' (prefix match)`。
- 归档兜底与 did-you-mean 不移植（proposal Impact 节已声明）。

## 接线点

- `show`：change 分支与 `--type change` 分支；spec 分支保持精确匹配且优先（v1 语义：
  spec id 不被同前缀 change id 劫持——v2 现有 spec 分支先行即已满足）。
- `validate <item>`：change 单项分支；`--json` 的 `matchedViaPrefix` 如实上报。

## 技术债收敛

- review-freeze r23 warningCount 措辞 → 「pending、unbound、stale 三类信号计数之和」
  （v1 review.rs 口径，v2 实现不变，仅条款文本对齐）。
- `renderSpecJson` morphology 字面量 → 复用 `collectSpecs(...).find(...).morphology`
  （`SpecMorphology` 为单一来源；renderSpecJson 其余 requirements/scenarios 组装不动）。
