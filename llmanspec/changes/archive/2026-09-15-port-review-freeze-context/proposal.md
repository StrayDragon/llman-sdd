---
depends_on:
- port-peripheral-commands
branch: sdd/port-review-freeze-context
base_sha: aa63fe74e2fccc5cb223a80ce954e48ad7023c0b
base_branch: main
---

# Port:review 聚合审查与 freeze/thaw 冷备(Phase 7)

## Why

补齐流水线自身依赖的 `review`(apply-cycle 门禁用它)与核心功能 `archive freeze/thaw`(7z 冷备,范围裁决定案保留)。`index/context`(pageindex + LLM agentic 检索)拆分到独立 change `port-context-index`——agentic loop 有外部 LLM 依赖语义,与离线冷备混在一个 change 会稀释验收。

## What Changes

- `review [--capability <id>] [--json] [--export-html <path>]`:五信号聚合(pending/manual/unbound/stale 占位 + locked/validate),JSON 形状 `{signals:[{kind,capability,count,detail}], summary:{criticalCount,warningCount}}`;退出码仅 critical(validate sweep 失败)时非零;`--export-html` 用 v1 shared/review.html 模板渲染自包含报告
- `archive freeze [--before DATE] [--keep-recent N] [--dry-run] [--list]`:候选 = 早于 before 的归档目录(保留最近 N 个),写入 `changes/archive/freezed_changes.7z.archived` 并删除原目录
- `archive thaw --change <名>`(可重复):从冷备回置归档目录到 `changes/archive/`,未知名报错
- 7z 适配器:7z-wasm(Emscripten NODEFS + callMain,spike 已验证 Bun 兼容),与 v1 sevenz-rust2 产物双向兼容
- staleness 信号为占位(v2 延后,detail 标注 deferred;活体 golden 归一化排除该 detail)

## Capabilities

- review-freeze
