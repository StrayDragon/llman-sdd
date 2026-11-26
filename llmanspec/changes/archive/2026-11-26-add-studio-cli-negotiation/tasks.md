# Tasks: add-studio-cli-negotiation

> 验收 Seam：经 `tests/helpers/` 拉起的真实 `llman-sdd` CLI 子进程 + 临时仓库，验证退出码 `0/1/2`、`--directory`、`--dry-run`、默认分支拒写、特性分支行号打乱后精准语义写回 `.feature` 及 `validate` 往返全绿。

- [x] T1 搭建 `studio` 纯父分组骨架与原子存储适配器：新增 `apps/cli/src/commands/studio.ts` 并在 `apps/cli/src/program.ts` 挂载（裸调报用法错退出码 2，对齐 `change`/`spec`/`project`/`self`）；实现 `makeNodeStudioStateIo(instanceRoot)`（`.llman-sdd/studio/states/` 临时文件 + 原子 `rename`）、缺省 `state-id` 消歧与 `studio state list/prune`（支持 `--json`/`--compact-json`/`--directory`），补齐子进程单测与 BDD 场景。

- [x] T2 `[blocked-by: T1]` 实现只读、预检与 Prompt 子命令：实现 `studio diff [state-id]`（语义 Diff、未解决评论 + 基于 `jsdiff` 的内存 Unified Diff 预览，无新 TOON 耦合）、`studio validate [state-id]`（支持 `--patch <path|->` 预检假设修订不改草稿）与 `studio prompt [state-id]`（输出结构化 Prompt，可选 `--copy`），补齐子进程测试。

- [x] T3 `[blocked-by: T1]` 实现写回协商子命令：实现 `studio comment reply <state-id> <comment-id> --body <text>`（支持 `--resolve`）与 `studio revise <state-id>`（从 stdin 或 `--file` 读取 JSON `RevisionOp[]` + `--rationale`，仅写入独立建议层不覆盖人类草稿），补齐原子写入与错误入参退出码 2 测试。

- [x] T4 `[blocked-by: T2]` 实现 `studio apply <state-id>` 语义写回与默认分支强护栏：校验全部目标机器过 E1–E4，支持 `--dry-run` 在任意分支零副作用打印 Unified Diff；非 `--dry-run` 时在默认分支强拦截退出码 1，在绑定特性分支/worktree 上语义定位目标 `例子:` 表直写 `.feature`（含文件上方新增 20 行打乱行号后仍精准命中与 `create` 新建场景），验证写回后 `llman-sdd validate` 全绿。

- [x] T5 `[blocked-by: T2, T3, T4]` 同步 Skill 模板与 Golden 基线：更新 `packages/core/templates/` 中的 `llman-sdd-explore` 与 `llman-sdd-propose` 模板补充 Studio CLI 协商指引，执行 `init --update` 刷新 `.agents/skills/` 与 `tests/golden/` 基线，并运行全量 `just qa` 验证全绿。
