---
depends_on: []
branch: sdd/close-v1-parity-gaps
base_branch: main
base_sha: 306f08c19e9cbd8e5605f4dbc1f171decdb5784e
---

## Why

对 v1（`../llman.old-rs-impl-sdd`）SDD specs 的对比核验（两个只读核查 + 逐条 file:line 验证）发现一批真实缺口与规格措辞失真。经修正分析者四处误报后（graph 已有自有前缀解析、v1 archive 同样要求干净树、stale 索引是静默使用、frontmatter 守卫为 ERROR 级且已存在），确认以下分歧需要收敛，原则统一为 **v1 对齐**：

1. **validate 完整性 WARNING 面缺失**（v1 r1）：v2 对「stage=full 已绑定但 specs 未 landed」不报带 skill 引导的 WARNING；对「默认分支上 llmanspec/specs 脏改动」也无 WARNING。JSON 消费面（对齐口径内）。
2. **context 懒刷新缺失**（v1 r97）：v2 索引 missing 时只返回 qualityNote 不自动 rebuild；stale 时更静默使用旧索引（比报告所述更差）。
3. **前缀解析覆盖面窄于 v1**（v1 r112）：v2 只接了 show/validate；v1 还覆盖 change start/attach/diff/finalize/archive。graph 的自有解析（含归档兜底）无合约记录。
4. **finalize 缺「当前分支 == binding.branch」门**（v1 r94）：core `finalizeChange` 从任意分支执行都会 `git switch` 到目标分支强推收口。
5. **frontmatter 合法字段集无合约条款**（v1 r124）：实现已有 ERROR 级守卫（六字段），规格缺失。
6. **孤儿 @executable 无 validate WARNING**（v1 r132）：v2 仅落在 review unbound 与 morphology 计数。
7. **validation r12 scope 措辞过严**：「缺失判 ERROR」与实现（--strict 才 ERROR，否则 WARNING，v1 r42 语义）不符——措辞错、实现对。

## What Changes

- 行为合约（Specs landing）：validation.feature r12 scope 措辞修正 + 新增 r63（validate 完整性 WARNING）/r64（frontmatter 合法字段集）/r65（孤儿验收 WARNING）；context-index.feature 新增 r62（检索前索引懒刷新）；peripheral-commands.feature r61 扩面（change 五个子命令接入 + graph 自有解析入约）；change-lifecycle.feature r15 补 finalize 分支门。
- 实现：validateChange 注入 GitLike 后报 Full-not-ready WARNING（skill 引导文案）与 full 阶段 completeness INFO；validate 命令对默认分支脏 specs 报单次 WARNING；validate.ts 对孤儿 @executable 报 WARNING；context 命令检索前 missing/corrupted/stale 自动 rebuild 一次（失败输出 `index_rebuild_failed` JSON error）；resolveChangeId 接入 change start/attach/diff/finalize/archive；finalizeChange 增加 branch==binding 门。
- 文档（合并后直提）：llmanspec/AGENTS.md 补记 locked 门裁剪为有意分歧 + 回填 Change Proposal Frontmatter SSOT 章节。

## Capabilities

- validation（r12 措辞、r63/r64/r65）
- context-index（r62）
- peripheral-commands（r61 扩面）
- change-lifecycle（r15 finalize 门）

## Impact

- finalize 行为收紧：从非绑定分支执行将报错（此前会强制切分支收口）——v1 r94 语义，防误操作；绑定分支上的既有流程不变。
- change 五个子命令接受唯一前缀（纯增量）；多前缀命中报错列候选。
- context 在索引过期时自动重建（零 LLM），检索延迟换正确性；失败路径 JSON errorKind 明确。
- validate 新增两条 WARNING（默认不阻断，--strict 升级）与孤儿验收 WARNING。
- v1 的归档 change 兜底解析与 did-you-mean 维持不移植（前次 change 已记录）；graph 归档兜底作为特例写入 r61。
