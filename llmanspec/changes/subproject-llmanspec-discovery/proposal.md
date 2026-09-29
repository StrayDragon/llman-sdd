---
depends_on: [align-next-req-id-max-plus-one]
---

# 子项目（workspace 子包）llmanspec 的自动发现与验证

> 草案：固化 2026-09-29 与用户头脑风暴的设计共识（GitHub issue #6）。落实时走 `llman-sdd-propose` 正式化，正式 design.md 在彼时展开。

## Why

xylitol 等 Rust/JS workspace 中，子包（如 `packages/xylitol-tui`）的行为 specs 全部堆在根 `llmanspec/specs/`，而对应代码、测试、runner 都在子包里——scope 与代码分离，staleness 门与验证命令无法按子项目收敛；子包（尤其通用引擎）应当能相对独立地携带自己的 specs 与验证，随包版本演进。

设计公理（用户定案）：**llman-sdd 的一切操作以"一个 llmanspec/ 目录"为单位，根仓库只是缺省实例；子包携带自己的 llmanspec 就是又一个实例，走完全相同的代码路径——零特殊分支、零子项目模式**。最大回报是可移植性：子包 llmanspec 与根的形状字节同构，独立发仓时原样抬走，无需迁移。

## What Changes

已拍板的决定：

- **自动发现**：以 git 根为起点按约定扫描 `llmanspec/` 目录（深度复用扫描深度旋钮先例，排除 node_modules/target 类目录），根自身算第 0 号根；约定优先、配置声明兜底。零子包时发现结果 = 根自己，行为与今天逐字节一致。
- **validate 双粒度，同一算子**：
  - 逐根（分开）：cd 进子包直接跑（cwd 字面量语义今天已成立，升格为明文契约）；另提供 `--directory <path>` 固定搜索根（免 cd、脚本友好）。**不做 `--roots <path>` 多选**（用户定案），`--directory` 一个旋钮固定发现起点即可。
  - 聚合（合在一起）：单个布尔旗标（建议 `--all-roots`）触发扇出——对每个发现根跑同一套 validate（含该根 config 的 `check_command` batch-once），结果按根分组、带根归属；**退出码 = 任一根红即红**。缺省仍是当前根，不自动聚合（自动的是发现，显式的是聚合——BDD 聚合成本为各根套件之和，退出码可预测性要求缺省保守）。
- **路径单一归属（硬边）**：一个文件路径只归属一个 llmanspec 根；子包有 llmanspec 的目录，根 specs 不得再 scope 进去，违规为 validate ERROR。这是两个粒度结果可加性的地基。
- **req id 命名空间按根**：`next-req-id` 在哪个根上跑就扫哪个根的注册表，跨根不保证全局唯一（各根 `resolve-req` 自洽）。承接 `align-next-req-id-max-plus-one` design.md 预留的钩子：max+1 语义不变，仅注册表扫描根随 #6 重定义。
- **change 流水线保持 git 级**（统一原则的诚实推论而非特殊化）：monorepo 里 branch/commit 无法按子目录切分；changes/ 留在 git 根，proposal scope 指向 `packages/…`。子包有自己的 config.yaml（locale、`check_command` 等），per-root runner 差异（bun test / cargo test / pytest）天然成立。
- **阶段划分**：先统一 spec/验证/配置面（发现 + 双粒度 validate + 单一归属），change 面维持 git 级不拆。

## Capabilities

- 预期涉及：`validation`（发现与聚合）、`peripheral-commands`（spec 助手按根取号）、`config-schema`（多根配置面）、`cli`（`--directory` / 聚合旗标）。propose 时以 context/list 重新精确定位。

## Impact

- 首个试点：xylitol 侧 16 个 `package-tui-*` capability 整体迁入 `packages/xylitol-tui/llmanspec/`（issue #6 报告者已表态）。
- 输出面新增根维度（TOON/JSON schema 演进）属输出契约变更，propose 时单列升级路径。
- 向后兼容：单根仓库零感知。
