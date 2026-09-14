---
depends_on:
  - port-config-and-parsing
---

# Port:change 生命周期(git-native)(Phase 4)

## Why

v1 的 git-native 合同(`change/git_native.rs`、`finalize.rs`、`archive.rs`、`new.rs`)是行为契约最密集处:frontmatter 分支绑定(注释保留 upsert)、干净树门、`sdd/<id>` 分支、squash/ff 合并、`archive(sdd): <id>` 单 commit 收口、归档重命名。

## What Changes

- git 子进程封装(local-first 默认分支解析、merge-base、worktree 探测)
- `change new --from`(id 约定)/ `start` / `attach` / `diff` / `next-id` / `finalize` / `archive` 全链路
- frontmatter 绑定读写(`read_binding`/`write_binding` 注释保留)
- 临时仓库集成测试覆盖全链路;best-effort 合并失败语义(WARNING + 手工命令 + 继续归档)
- 冻结合并:`change freeze`/`thaw` 留待 port-peripheral-commands(7z 适配器在那落地)
