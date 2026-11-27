# Design: 人类定理（Human Theorems）只读不变量层与轻量精简 Skill 演进

## D1 物理落点与纯域声明格式（`packages/core/src/theorems/theorems.ts`）

- **落点**：`llmanspec/theorems/*.md`（极少数短主题文件，便于粒度权限锁与人类快速检索；`llmanspec/theorems/` 不存在时零报错，按可选增厚层渐进启用）。
- **轻量 Lean-inspired 语法**（纯 Markdown + 轻量 frontmatter，人类易读、零学习成本）：
  ```markdown
  ---
  title: "核心架构边界"
  owner: human
  ---

  ## theorem:<id> — <标题>
  - **statement**: <什么必须成立 / 什么不得被擅自改变>
  - **rationale**: <为何设立>
  - **gate**: `<可选可执行检查命令>`
  - **scope**: `<可选路径或模块范围>`
  ```
- **纯域能力**（零 I/O、零 `node:*`、零墙钟调用）：
  - `parseTheoremFile(fileName, content)`：解析 frontmatter 与全部 `## theorem:<id>` 块；
  - `validateTheoremSet(files)`：校验重复定理 ID、空 `statement` 与结构错误；
  - `buildTheoremLockManifest(files, sha256Fn)` / `verifyTheoremLockManifest(files, lock, sha256Fn)`：纯函数生成与核对 `llmanspec/theorems/.theorems.lock.json` 哈希封签。

## D2 双层防篡改机制（Git 友好主防线 + 可选 OS 物理写锁）

直接对入库文件设 `root:root` 属主会导致 `git checkout` / `git merge` / `change archive` 报错。因此采用双层协同：

1. **主防线（Git 顺滑的哈希封签门禁）**：`llman-sdd theorem lock` 写入 `llmanspec/theorems/.theorems.lock.json` 记录各定理文件 SHA-256；`llman-sdd theorem check` 核对语法与封签一致性，任何未经人类重新封签的篡改/新增/删除均以退出码 `1` 报错；加 `--run-gates` 时进一步顺序执行各定理声明的 `gate` 命令，把不变量真正下沉到确定性门禁。
2. **可选 OS 物理加固**：`llman-sdd theorem lock` 默认将定理文件与锁文件设为只读 `0444`；`llman-sdd theorem unlock` 恢复 `0644` 供人类编辑；传入 `--root` 时明确打印本机可执行的一行 `sudo chown root:root ... && sudo chmod 0444 ...` 与切分支前解锁指引（不静默挂起等密码）。

## D3 全域只读注入与 Studio 只读预览 / 检索

- **模板与预设注入**：
  - 在 `packages/core/templates/zh-Hans/llmanspec-agents-stub.md` 与 `units/skills/structured-protocol.md` 注入只读遵循约束：每次会话先查 `llmanspec/theorems/`（或运行 `llman-sdd theorem list`），严格遵守其中硬不变量，不得由 Agent 擅自修改或绕过。
- **Studio Web 只读预览与深度召回**：
  - 扩展 `bootstrapResponseSchema` 附带可选 `theorems[]` 与 `theoremLockStatus`，扩展 `studioSearchTargetKindSchema` 支持 `'theorem'`，并将定理正文与 `gate` 纳入 Tier 0 `buildWorkspaceSearchDocuments` 索引（`⌘K` 与 `+ 新标签页` 立即可召回）；
  - Studio 服务端 strictly read-only（不暴露任何修改定理的写端点）；
  - 前端新增右锚只读抽屉 `TheoremsDrawer.tsx`（与世界线抽屉互斥，遵守真言 1 同侧展开与小地图左让），支持按关键词过滤、高亮 `statement` / `rationale` / `gate` 与一键复制人类解锁命令（`llman-sdd theorem unlock`）。
- **本仓自举**：落地 `llmanspec/theorems/architecture.md`（沉淀 `core-zero-io`、`cli-dual-runtime`、`studio-production-hygiene` 三条真实核心不变量）并生成 `.theorems.lock.json`。

## D4 `llman-sdd-*` Skills 轻量化精简演进

- 在严格保留 `r70`（`REQUIRED_PER_FILE`）、`r66`、`r138`、`r19` 全部契约标记与 `r67` 命令面一致性的前提下，对 4 份最重的核心技能模板（`llman-sdd-propose.md`、`llman-sdd-apply.md`、`llman-sdd-verify.md`、`llman-sdd-archive.md`）做系统瘦身：
  - 移除与共享 `units/` 重复展开的过程复读、对强模型冗余的 12 行教材式坏味表与重复归档叙述；
  - 重心收束到「人类定理不可变边界 + 规格唯一事实来源 + 可执行门禁」；
  - 在 change 分支相对 merge-base 验证精简前后 4 份模板总字节数净降 `>= 20%` 且 STC 错误计数同步下调（更新 `scripts/stc-baseline.json`）。

## Open Questions 决议

- 物理落点：采用 `llmanspec/theorems/*.md`（少量短文件，便于粒度只读锁与清晰职责）。
- OS 锁与 Git 共存：采用 `.theorems.lock.json` 哈希封签作主防线 + `chmod 0444/0644` 可选本地只读锁 + `--root` 输出显式 `sudo` 指引。
- 瘦身量化验证：以 change 分支相对 merge-base 的核心 4 技能字节数净降幅 + STC 基线下调 + 全量 `just qa`（含 `r70`/`r67`/`r19`）全绿作为确定性验收基准；`eval/` 剧本基准保留供外部模型压测。
