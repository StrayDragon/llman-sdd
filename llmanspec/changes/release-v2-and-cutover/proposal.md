---
depends_on:
- port-validation-engine
- port-change-lifecycle
- port-init-and-generators
- port-peripheral-commands
- port-review-freeze-context
- port-context-index
- refine-slop-qa-release
branch: sdd/release-v2-and-cutover
base_sha: 9742d01d6215108b8e7f9ee89b9391d6d12632f7
base_branch: main
---

# Release:v2 发布与切换(Phase 7)

## Why

v2 功能对齐后,建立发布管线并完成本仓库的狗粮切换:从 v1(Rust llman)迁移到 v2 工具管理本仓库的 SDD 流程——切换本身就是最真实的验收。终态目标:**v1 对拍设施全部退场,`llmanspec/` 成为行为的唯一 SSOT**。

## What Changes

- npm 包发布(包名/bin 名待定:`llman-sdd` + `llmanspec` 兼容入口候选)+ `bun build --compile` 多平台二进制 matrix 发布(冒烟 + sha256)
- release workflow(tag 触发,fetch-depth: 0 供版本注入)
- 本仓库执行 `init --update`(v2 版):skills 托管权从 v1 切到 v2,验收生成物零漂移
- **切换前:临时扩充 v1(Rust)行为对拍**(临时门,切换完成即拆,2026-09-16 定案):在现有 golden:cli 12 命令 + golden:validate + BDD 活体场景之外,对剩余用户可见行为补活体对照——change 生命周期全子命令、fresh init 产物(llmanspec/AGENTS.md 含 v2 托管块分歧点的显式裁决记录)、archive freeze/thaw 全参数组合、review --export-html、context 守卫与错误路径(退出码 + 输出形状);覆盖口径记录进 `docs/acceptance-v2.md`
- **切换后:移除全部 v1 对拍门,llmanspec 成为唯一 SSOT**(定案,2026-09-16):golden:cli、golden:validate、BDD 活体对照场景(活体 golden/v1 冻结)、golden:check 的 v1 渲染基线依赖全部拆除;skills 渲染的回归保护改由 v2 自有快照基线或 BDD 场景承接(方式在本 change 内设计);`docs/acceptance-v2.md` 改写为纯 v2 验收清单
- **切换完成后的去 v1 化清理清单**(随本 change 统一收口):
  - `llmanspec/AGENTS.md` 孤儿英文头清理(2026-09-16 调研定案 C:v2 托管块行为保留——spec r17 已裁决;块下旧 en stub 属用户空间内容,直接删除;v1 `init.rs` 对该文件"原样写回"与其注释不符的差异一并记录)
  - `packages/core/templates/` 模板内容的 v1 措辞(改动须同步刷新替换后的基线)
  - `project migrate` stub 的 v1 指引文案:v1 退役后改写或移除
  - 命令名/二进制名终局裁决(`llman-sdd`;`llman sdd` 退役节奏与公告)
  - 代码注释出处标注(Port of v1 xxx 等,可选)、README QA 门禁表、验收文档与 `llmanspec/AGENTS.md` 验收基线条款的 v1 措辞更新
- 旧命令裁剪公告与 README;v1 兼容性说明(config.yaml / changes/ 布局零迁移可读)
