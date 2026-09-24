---
depends_on: []
needs_specs_change: true
branch: sdd/fix-lifecycle-validation-defects
base_branch: main
base_sha: e16d51b928c1ccb837ddbc7373650456cad41067
---

# 生命周期与校验缺陷修复:依赖解析/范围计算/worktree 绑定/harness 执行

## Why

2026-09-24 全仓审计(源码 × specs × AGENTS × 测试四方对账)在 change 生命周期与 validation 域发现三条确定性 bug、一处合约自相矛盾与一批 AI slop,且全部被当前门禁放行(288 测试全绿):

1. `depends_on`/`blocks` 引用不存在的 change 永不报错——判定条件含 `!exists(changes/archive/)`,真实仓库必有 archive/,整条检查被短路;单测夹具恰好不建 archive/ 所以绿。
2. `change diff --json` 的 `commitCount` 以 frontmatter `base_sha` 为范围基点,违反「`base_sha` 仅审计不参与范围计算(现算 merge-base)」定案;且用 `A...B` 对称差,基线分支前进后计数虚高。
3. `change start --worktree` 把 binding 写进**发起检出**(通常是 main 工作树),新 worktree 的特性分支上没有 binding——与经典 `start`(binding 落在特性分支)不一致,worktree 内 stage 推断不到 full。
4. validation r13(validate MUST NOT 执行 `bdd.run_command`)与 r48(含占位符 MUST 逐项替换**后执行**、无占位符 batch-once)直接矛盾;代码按 r13 从不执行,r48 的 `@executable` 只断言退出码 0——对不存在的行为给出假绿。定案:**恢复 v1 执行语义**(改写 r13,落实 r48)。
5. slop:两套 frontmatter 切分器闭合规则不同;`needs_specs_change` 在 proposal **全文**上正则匹配(正文一行即可翻转);`checkChangeDoc` 保留一套与 `validateChange` 不同口径的遗留 stage 门;面向用户的报错夹带内部需求编号 `(r111)`/`(sdd-workflow r29)`/`(spec-format r133)`;空 scope 报错仍指向已移除的 `.toon document`;human Next steps 有 `ISON` 笔误;同类 git 门报错措辞不一;`catch {}` 吞掉非法 pattern。

另:两份 spec 中大量原子 MUST 条款仅被「一条 happy path」`@executable` 覆盖(审计矩阵:change-lifecycle 约 18 条 UNCOVERED、8 条 WEAK;validation 约 12 条 UNCOVERED、7 条 WEAK),本变更一并补齐可执行验收以固定行为。

## What Changes

Specs landing:`llmanspec/specs/validation.feature`、`llmanspec/specs/change-lifecycle.feature`。

1. **依赖引用解析(新 r73)**:`depends_on`/`blocks` 每项 MUST 命中活跃 change 或 `changes/archive/<date>-<id>` 归档条目,否则 ERROR;frontmatter 读写统一单一切分器;`needs_specs_change` 只从 frontmatter 读取。
2. **harness 执行(改写 r13、落实 r48)**:配置了 `bdd.run_command` 时 `validate` 的 spec 域缺省执行 harness,`--no-check` 关闭,`--check` 为兼容别名;占位符按 capability 逐项展开,无占位符 batch-once;嵌套调用经环境变量守卫跳过;review / finalize 内部校验 sweep MUST NOT 执行 harness。
3. **diff 计数(改写 r46)**:`commitCount` = `merge-base(base_branch, branch)..branch` 提交数;`base` 字段保留存储的 `base_sha`(v1 JSON 形状),但 MUST NOT 参与计数。
4. **worktree 绑定落点(改写 r68)**:binding MUST 写入新 worktree 的 proposal;发起检出 MUST 字节不变。
5. **输出卫生(新 r74)**:`validate` 与 `change` 子命令的 stdout/stderr MUST NOT 含内部需求编号;统一 git 门报错措辞;修 `.toon`/`ISON` 文案。
6. **删除遗留**:`checkChangeDoc` 的 stage 分支、吞异常的 `catch {}`;archive 的 `today` 改为必传(时钟注入);r40 的 `min_completion_ratio` 门不可达(未勾任务已无条件阻断)且 validate 侧从不读取——删除该条款与全部消费方,CLI 重复实现的任务门收敛回 core(schema 字段删除登记给第二波)。
7. **补齐可执行验收**:validation r12/r13/r47/r48/r63/r64/r65/r73/r74 与 change-lifecycle r14/r15/r31/r34/r35/r36/r39/r40/r44/r45/r46/r60/r68/r69 新增或加强 `@executable` 场景。

## Capabilities

- validation(r13/r48 改写;r73/r74 新增;r12/r47/r63/r64/r65 验收补强)
- change-lifecycle(r46/r68 改写;r14/r15/r31/r34/r35/r36/r39/r40/r44/r45/r60/r69 验收补强)

## Impact

- **行为变更(用户可见)**:配置了 `bdd.run_command` 的仓库,`validate --all/--specs` 将实际执行 harness(本仓库为 `bun test tests/bdd`,约 10s);`--no-check` 可关闭。模板中「validate 不执行 harness」的表述随之改写(validate/verify/explore/propose 四个 skill 的 zh-Hans 与 en 模板 + golden 基线再生成)。
- `change diff --json` 的 `commitCount` 数值在基线分支前进或 rebase 后会变化(修正为真实值);字段集不变。
- `change start --worktree` 后,发起检出不再出现未提交改动。
- 本变更属第一波,与 `harden-core-purity-config`、`align-docs-and-gates` 并行;文件所有权与 req id 号段见 design.md §7。
