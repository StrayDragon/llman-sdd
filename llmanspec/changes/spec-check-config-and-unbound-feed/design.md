# 设计：spec 验证配置升格与未绑定需求检索

决策来源：2026 深挖讨论逐项定案。本文记录决策、理由、被拒选项与迁移路径；Open Questions 已全部解决，无遗留。

## 1. 术语系（决策）

- **定案**：`requirement/需求` = `规则:` 块；`spec/specs` = capability 文件（`llmanspec/specs/<capability>.feature`）。与既有公开语汇一致：`requirementCount`、`spec add-req`（add requirement）、`@req:<id>`（requirement id）、AGENTS.md「需求 = `规则:` 块」。
- **被拒**：`specsBound/specsUnbound` 命名——「spec」在代码库公开面已是 capability 文件含义，若锚定「规则」会造成双关，且需连带改名 `spec` 命令组/`list --specs`/`show` 等，波及远大于本次。机器字段按 requirement 系改名（见 §3）。

## 2. 「绑定/未绑定」判定（决策）

- **定案（统一口径）**：全局唯一定义「未绑定」= **无 runnable 嵌套场景**（0 场景，或嵌套场景全部带 `@skip/@experimental` 即 `runnable=false`）。bound = 有至少一个 runnable 嵌套场景。
- **理由**：「绑定到真实逻辑」是唯一语义锚点；带 `@skip/@experimental` 场景的规则「已撰写但未真正绑定」，按作者信号（0 场景）判定会漏掉真实待实现项。
- **被拒**：双口径方案（度量 0 场景、feed runnable 口径）——词面「unbound」两义，违背一致性；全局收紧紧跟本条目即为统一后形态。

## 3. 配置段升格（决策）

- **定案**：`bdd:` 段 → `specs:` 段；字段 `framework`/`verify_prompt` 随迁，`run_command` → `check_command`。语义 =「整个 spec 验证」harness（batch-once + 占位符 + `--check/--no-check` 语义保留）。
- **旧形迁移**：`bdd:` 段在加载期识别并兼容提升为新 `specs:` 语义（`run_command`→`check_command` 字段级映射），输出 WARNING 提示改用新形；未来版本移除兼容层。`migrations/v0.5-v0.6/` 写升级 README。
- **close-out 门**：`specs.check_command` 已配置 → 对一切 `needsSpecsChange` 的 change 必跑（删除 `hasExecutable` 依赖）；未配置 → 跳过 + WARNING 引导（非阻断）。
- **被拒**：硬断（宽松忽略/加载报错）——`run_command` 是功能性键，静默失效最危险；别名长期并存——职责分裂。

## 4. `spec unbound` 命令（决策）

- 挂在既有 `spec` 命令组下，新子命令 `spec unbound`。
- 判定 = §2 统一口径（与全局一致）。
- 缺省 `--limit 1`，`--limit 0` = 全部；**limit 语义对 TOON/JSON/human 所有输出模式统一**（可预测、无双模式陷阱）。
- 输出：每条含 requirement id、title、statement、capability、featurePath（仓库根相对）；聚合并含 total/returned/remaining 与提示字段（「…还有 N 条，用 --limit 0 列出全部」）。
- 排序确定性：文件扫描序 + 文件内规则出现序（可复现，agent 可增量消费）。
- **被拒**：扩展 `review`/`list --specs`——耦合健康报告/能力列表面，且牵动既有报告合约。

## Open Questions

- 无（全部决策已定案）。
