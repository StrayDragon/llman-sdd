# v0.5 → v0.6 迁移指引：`bdd:` 配置段升格为 `specs:`

0.6.0 起，`llmanspec/config.yaml` 的 **spec 验证配置段**由 `bdd:` 改名为 `specs:`，
字段 `run_command` 更名为 **`check_command`**，语义从「BDD 测试」收敛为「整个 spec 验证」。

## 变更内容

- 新形（唯一推荐写法）：

  ```yaml
  specs:
    check_command: 'bun test tests/bdd'
    # framework: pytest-bdd      # 可选，与旧形同名随迁
    # verify_prompt: ...         # 可选，与旧形同名随迁
  ```

- 旧形 `bdd:` 段（`framework` / `run_command` / `verify_prompt`）仍在**兼容期**被识别：
  加载时自动提升为新 `specs:` 语义（`run_command` → `check_command` 字段级映射，
  `framework`/`verify_prompt` 同名随迁），并向 stderr 输出一次 WARNING 提示迁移；
  旧段内已删除字段（`bindings` / `default_language` / `feature_dir` 等）被宽松剥离。
  兼容层计划在未来版本移除。
- 行为变化（重要）：
  - **close-out（finalize/archive）**：配置了 `specs.check_command` 时，凡改动 specs 的
    change 在收口前**必跑**该命令，不再要求「存在可执行场景」；未配置时跳过并输出 WARNING
    引导（非阻断，可正常收口）。
  - `validate --check/--no-check` 语义与占位符（`{feature_path}`/`{feature_dir}`/`{feature_name}`）
    不变；文案「bdd harness」→「spec check」。
  - `list --specs` / `show <spec> --json` 的 morphology 字段改名：
    `ruleEnforcedCount` → `requirementBoundCount`、`rulePendingCount` → `requirementUnboundCount`；
    「未绑定」统一为「无 runnable 嵌套场景（0 场景或全部 `@skip/@experimental`）」定义。
  - 新增 `llman-sdd spec unbound [--limit N]` 检索未绑定需求（缺省 1 条 + 剩余数提示）。

## 升级路径

1. **改写配置（建议）**：把 `bdd:` 段替换为 `specs:` 段、`run_command` 改为 `check_command`
   （值原样保留）。运行任意命令会看到迁移 WARNING；`llman-sdd config` 概览显示 `specs: on/off`。
2. **机器消费方**：若解析 `list --specs --show` 的 JSON 字段（morphology 的
   `ruleEnforcedCount` / `rulePendingCount`），改用 `requirementBoundCount` /
   `requirementUnboundCount`。
3. **技能/模板变量**：模板变量 `bdd_*` 已改名为 `specs_*`（`specs_enabled`、
   `specs_framework`、`specs_check_command`、`specs_verify_prompt`）。用
   `llman-sdd init --update` 刷新项目 `.agents/skills` 即可。
4. 兼容期结束前，旧形配置仍可正常工作（建议尽早迁移以免未来静默失效）。
