# 任务：技能目录发现

测试边界（seam）：复用 `tests/bdd/steps/init.ts` 与 `tests/bdd/steps/config.ts` 的 CLI 子进程；技能渲染对账走 `tests/golden/`（`bun run check:skills-template-render`）。规格改动只在绑定分支上提交。

- [x] T1: 在绑定分支更新 `init-generators`、`config-schema`、`config-command`：根托管块不写入且 `--update` 剥离、全部 `llman-sdd-*` 注入、`extra_skills` 退出契约、`config skills` 消失、`init --check` 的兼容窗口与退出码
- [x] T2: 配置加载忽略遗留 `extra_skills`；`config` 概览去掉该行；删除 `config skills` 命令 [blocked-by: T1]
- [x] T3: `init` 停止写根 `AGENTS.md` 托管块，`--update` 剥离已有标记段并保留标记外正文；`llmanspec/AGENTS.md` 短说明仍写；候选集改为全部技能模板 [blocked-by: T1]
- [x] T4: 重写技能 `description`。apply-cycle、wayfinder、specs-compact、ff 以 `仅手动。` 起句，并带 `disable-model-invocation` 与 `agents/openai.yaml` [blocked-by: T3]
- [x] T5: 实现 `init --check`（主/次版本相同为兼容）；版本漂移 NOTE 改为指向该命令，且不改变所在命令的退出码 [blocked-by: T3]
- [x] T6: 补 BDD 与 golden 基线，使 T1 的场景可执行 [blocked-by: T2, T4, T5]
- [x] T7: `migrations/v0.10-v0.11/README.md` 追加本条：删除 `extra_skills`，运行 `init --update` [blocked-by: T6]
